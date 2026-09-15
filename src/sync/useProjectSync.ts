import { co } from 'jazz-tools'
import { useAccount, useIsAuthenticated, useLogOut } from 'jazz-tools/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from '../db'
import type { PhotoMap } from '../photoStore'
import { isValidProject, placedPhotoIds, type Project } from '../types'
import { SeqAccount } from './schema'
import { SYNC_BASE_PREFIX, setSyncStatus } from './status'

interface Args {
  project: Project | null
  setProject: (p: Project) => void
  updateProject: (fn: (p: Project) => Project) => void
  photos: PhotoMap
  setPhotos: (fn: (prev: PhotoMap) => PhotoMap) => void
}

export interface MergeSummary {
  spreads: number
  placed: number
}

export interface MergePrompt {
  /** 'merge': both sides changed since the last sync. 'upload': the account is empty
   *  but this device holds photos that look like another account's. */
  kind: 'merge' | 'upload'
  local: MergeSummary
  remote: MergeSummary
}

export type MergeChoice = 'remote' | 'local' | 'cancel'

export interface ProjectSync {
  /** true once signed in and the account root has loaded and been reconciled */
  active: boolean
  /** the login-time question, if any */
  pending: MergePrompt | null
  resolveMerge: (choice: MergeChoice) => void
  /** call after a local delete so the other devices drop their thumbnail copy */
  removePhoto: (id: string) => void
  /** leave the account on this device; resolves once the app is anonymous again, rejects if it isn't */
  logOut: () => Promise<void>
}

// Entries are resolved, thumbs are not: a thumb is fetched on demand only
// for photos this device lacks, so tombstones and already-held photos cost
// nothing and the root doesn't re-snapshot on every stream chunk.
// `$onError: 'catch'` keeps one unreadable entry from taking the root down.
const RESOLVE = { root: { photos: { $each: { $onError: 'catch' } } } } as const

const THUMB_LOAD_TIMEOUT = 60_000
const THUMB_MAX_ATTEMPTS = 6
/** a stream created on another device a moment ago may not be on the server yet: retry soon, then back off */
const thumbRetryDelay = (attempts: number) => Math.min(2_000 * 4 ** (attempts - 1), 60_000)

/**
 * The cloud document is `{ v, project }`. A build that meets a newer `v`
 * than it understands must never overwrite it.
 */
const SYNC_FORMAT = 1
type Envelope = { v: number; project: Project }

function encode(project: Project): string {
  return JSON.stringify({ v: SYNC_FORMAT, project } satisfies Envelope)
}

type Decoded = { ok: true; project: Project } | { ok: false; reason: 'empty' | 'malformed' | 'newer' }

function decode(json: string | undefined): Decoded {
  if (!json) return { ok: false, reason: 'empty' }
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'malformed' }
    const env = parsed as Partial<Envelope>
    if (typeof env.v !== 'number') return { ok: false, reason: 'malformed' }
    if (env.v > SYNC_FORMAT) return { ok: false, reason: 'newer' }
    return isValidProject(env.project) ? { ok: true, project: env.project } : { ok: false, reason: 'malformed' }
  } catch {
    return { ok: false, reason: 'malformed' }
  }
}

function summarize(p: Project): MergeSummary {
  return { spreads: p.spreads.length, placed: placedPhotoIds(p).length }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

function base64ToBlob(data: string, type = 'image/jpeg'): Blob {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/**
 * The last project JSON this device and the account agreed on, kept per
 * account in localStorage. At bootstrap it tells "which side changed since
 * we last synced" so the merge question is only asked when both did.
 */
function readBase(account: string): string | null {
  try {
    return localStorage.getItem(SYNC_BASE_PREFIX + account)
  } catch {
    return null
  }
}
function writeBase(account: string, json: string) {
  try {
    localStorage.setItem(SYNC_BASE_PREFIX + account, json)
  } catch {
    /* storage unavailable: we just ask more often */
  }
}
function hasOtherAccountBase(account: string): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(SYNC_BASE_PREFIX) && k !== SYNC_BASE_PREFIX + account) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

type Phase = 'deciding' | 'synced' | 'blocked'
interface Session {
  account: string
  phase: Phase
}

/**
 * Bridges App state <-> the Jazz account root.
 *
 * Contract (see AGENTS.md "Sync"):
 * - Only thumbnails travel. A remote delete (tombstone) removes a photo from
 *   this device only if this device holds just the thumbnail; a held original
 *   is unplaced and kept in the tray. Placing it again revives the tombstone.
 * - Per account the bootstrap decides *imperatively* (it pushes or applies
 *   right away, so the incremental effects never get to reverse it): equal →
 *   nothing; this device unchanged since last sync → cloud wins; cloud empty,
 *   untouched or unchanged since last sync → this device wins; this device
 *   has no placed photos → cloud wins; both changed → ask.
 * - All bookkeeping resets when the account id changes.
 */
export function useProjectSync({ project, setProject, updateProject, photos, setPhotos }: Args): ProjectSync {
  const authenticated = useIsAuthenticated()
  const me = useAccount(SeqAccount, { resolve: RESOLVE })
  const jazzLogOut = useLogOut() as unknown as () => Promise<void>
  const loaded = authenticated && me.$isLoaded ? me : null
  const accountId = loaded ? loaded.$jazz.id : null
  const root = loaded ? loaded.root : undefined

  const [session, setSession] = useState<Session | null>(null)
  const [pending, setPending] = useState<MergePrompt | null>(null)
  /** bumped by a timer when a failed thumb download is due for another attempt */
  const [retryTick, setRetryTick] = useState(0)

  const lastPushed = useRef<string | null>(null)
  const lastRemoteApplied = useRef<string | null>(null)
  /** a local edit is waiting for the push debounce; remote changes must not discard it */
  const pendingPush = useRef(false)
  const uploading = useRef(new Set<string>())
  const downloading = useRef(new Set<string>())
  /** ids deleted locally before their remote entry existed or was loaded */
  const deletedLocally = useRef(new Set<string>())
  /** tombstones this device has already acted on (unplace happens once per transition) */
  const handledTombstones = useRef(new Set<string>())
  /** thumb downloads that failed: attempt count and when to try again */
  const thumbFailures = useRef(new Map<string, { attempts: number; nextAt: number }>())
  const bootstrappedFor = useRef<string | null>(null)

  // latest values for async work and callbacks
  const projectRef = useRef(project)
  projectRef.current = project
  const photosRef = useRef(photos)
  photosRef.current = photos
  const accountRef = useRef(accountId)
  accountRef.current = accountId
  const authRef = useRef(authenticated)
  authRef.current = authenticated

  const logOut = useCallback(async () => {
    await jazzLogOut()
    for (let i = 0; i < 30 && authRef.current; i++) await sleep(100)
    if (authRef.current) throw new Error('logout did not complete')
  }, [jazzLogOut])

  const applyRemote = useCallback(
    (json: string, parsed: Project) => {
      lastRemoteApplied.current = json
      // once something else has been applied, our last push is history:
      // the other device may legitimately return to that exact state
      lastPushed.current = null
      if (accountRef.current) writeBase(accountRef.current, json)
      setProject(parsed)
    },
    [setProject],
  )

  /** write this device's project to the cloud now, reviving any tombstoned photo it places */
  const pushNow = useCallback((r: NonNullable<typeof root>, local: Project) => {
    const json = encode(local)
    const rp = r.photos
    if (rp) {
      for (const id of placedPhotoIds(local)) {
        const entry = rp[id]
        if (entry?.$isLoaded && entry.deleted) entry.$jazz.set('deleted', false)
      }
    }
    lastPushed.current = json
    lastRemoteApplied.current = null
    pendingPush.current = false
    r.$jazz.set('projectJson', json)
    if (accountRef.current) writeBase(accountRef.current, json)
  }, [])

  // ---- 1. per-account bootstrap ----
  useEffect(() => {
    if (!accountId || !root) {
      setSession(null)
      setPending(null)
      return
    }
    if (session?.account === accountId) return

    if (bootstrappedFor.current !== accountId) {
      // a different account (or the first one): forget everything
      lastPushed.current = null
      lastRemoteApplied.current = null
      uploading.current.clear()
      downloading.current.clear()
      handledTombstones.current.clear()
      thumbFailures.current.clear()
      if (bootstrappedFor.current !== null) deletedLocally.current.clear()
      bootstrappedFor.current = accountId
    }

    const remoteJson = root.projectJson
    const local = projectRef.current
    const localJson = local ? encode(local) : ''
    const remote = decode(remoteJson)
    const base = readBase(accountId)
    const localPlaced = local ? placedPhotoIds(local).length : 0

    let cancelled = false
    ;(async () => {
      if (!remote.ok && remote.reason !== 'empty') {
        // a book we can't read: never overwrite it, never pull it
        console.warn('sync: cloud project is', remote.reason, '; sync paused on this device')
        setSyncStatus({ incompatible: remote.reason === 'newer' })
        setSession({ account: accountId, phase: 'blocked' })
        return
      }
      setSyncStatus({ incompatible: false })

      if (remote.ok && remoteJson === localJson) {
        setSession({ account: accountId, phase: 'synced' })
        return
      }
      if (!remote.ok) {
        // empty account. If this device carries traces of another account
        // (its merge base, or thumbnail-only photos), don't upload silently.
        const thumbOnly = photosRef.current.size > 0 && (await db.loadPhotos()).some((r) => r.hasOriginal === false)
        if (cancelled) return
        if (local && photosRef.current.size > 0 && (thumbOnly || hasOtherAccountBase(accountId))) {
          setPending({ kind: 'upload', local: summarize(local), remote: { spreads: 0, placed: 0 } })
          setSession({ account: accountId, phase: 'deciding' })
          return
        }
        // An empty book is not worth writing: another device's first push
        // may still be on its way to the server, and last-write-wins would
        // let this blank overwrite it. Edits made later are pushed as usual.
        if (local && (localPlaced > 0 || photosRef.current.size > 0)) pushNow(root, local)
        setSession({ account: accountId, phase: 'synced' })
        return
      }
      if (localJson === base || !local || localPlaced === 0) {
        // this device hasn't changed since it last synced, or has no book: cloud wins
        applyRemote(remoteJson, remote.project)
        setSession({ account: accountId, phase: 'synced' })
        return
      }
      if (placedPhotoIds(remote.project).length === 0 || remoteJson === base) {
        // untouched cloud book, or the cloud hasn't moved since we last synced: this device wins
        pushNow(root, local)
        setSession({ account: accountId, phase: 'synced' })
        return
      }
      setPending({ kind: 'merge', local: summarize(local), remote: summarize(remote.project) })
      setSession({ account: accountId, phase: 'deciding' })
    })()
    return () => {
      cancelled = true
    }
  }, [accountId, root, session?.account, applyRemote, pushNow])

  const deciding = Boolean(root && session && session.account === accountId && session.phase === 'deciding')
  const synced = Boolean(root && session && session.account === accountId && session.phase === 'synced')
  const remotePhotos = root?.photos
  const remoteJson = root?.projectJson

  // keep the question current while it is open (the cached root may be stale
  // until the server catches up)
  useEffect(() => {
    if (!deciding || !remoteJson) return
    const remote = decode(remoteJson)
    const local = projectRef.current
    if (!remote.ok || !local) return
    setPending((p) => (p ? { ...p, local: summarize(local), remote: summarize(remote.project) } : p))
  }, [deciding, remoteJson])

  const resolveMerge = useCallback(
    (choice: MergeChoice) => {
      if (!root || !accountId) return
      if (choice === 'cancel') {
        setPending(null)
        logOut().catch((err) => {
          console.error('sync: logout failed', err)
          setSession(null) // re-run the bootstrap so the question comes back
        })
        return
      }
      setPending(null)
      if (choice === 'remote') {
        const remote = decode(root.projectJson)
        if (remote.ok) applyRemote(root.projectJson, remote.project)
      } else {
        // 'local': only the sequence is replaced; cloud-only photos simply
        // download into this tray, so nothing is deleted anywhere
        const local = projectRef.current
        if (local) pushNow(root, local)
      }
      setSession({ account: accountId, phase: 'synced' })
    },
    [root, accountId, logOut, applyRemote, pushNow],
  )

  // ---- 2a. project: pull ----
  useEffect(() => {
    if (!synced || !root || !remoteJson) return
    if (remoteJson === lastPushed.current || remoteJson === lastRemoteApplied.current) return
    if (project && remoteJson === encode(project)) return
    // The user just did something here and the push hasn't gone out yet:
    // their action wins over whatever arrived meanwhile (the push will carry
    // it to the other device). Whole-document LWW; see AGENTS.md.
    if (pendingPush.current) return
    const remote = decode(remoteJson)
    if (!remote.ok) {
      console.warn('sync: ignoring cloud project:', remote.reason)
      return
    }
    applyRemote(remoteJson, remote.project)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, root, remoteJson])

  // ---- 2b. project: push (debounced) ----
  useEffect(() => {
    pendingPush.current = false
    if (!synced || !root || !project) return
    const json = encode(project)
    if (json === root.projectJson) return
    // a blank book has nothing to tell an empty account (and another device's
    // first push may be on its way; last-write-wins must not let this blank win)
    if (!root.projectJson && placedPhotoIds(project).length === 0 && photosRef.current.size === 0) return
    // don't echo a state we just received; cleared after the first real push
    // so that reverting to that state later is pushed too
    if (json === lastRemoteApplied.current) return
    pendingPush.current = true
    const timer = window.setTimeout(() => pushNow(root, project), 300)
    return () => window.clearTimeout(timer)
  }, [synced, root, project, pushNow])

  // ---- 2c. photos: reconcile ----
  const dropLocal = useCallback(
    (id: string) => {
      db.deletePhoto(id)
      setPhotos((prev) => {
        const victim = prev.get(id)
        if (!victim) return prev
        URL.revokeObjectURL(victim.thumbUrl)
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    },
    [setPhotos],
  )

  const unplace = useCallback(
    (id: string) => {
      updateProject((p) => {
        if (!placedPhotoIds(p).includes(id)) return p
        return {
          ...p,
          spreads: p.spreads.map((s) => ({
            ...s,
            left: s.left.photoId === id ? { ...s.left, photoId: null } : s.left,
            right: s.right.photoId === id ? { ...s.right, photoId: null } : s.right,
          })),
        }
      })
    },
    [updateProject],
  )

  useEffect(() => {
    if (!synced || !root || !remotePhotos) return
    const remoteIds = new Set(Object.keys(remotePhotos))
    const forAccount = accountId
    const now = Date.now()
    let toDownload = 0
    let toUpload = 0
    const heldTombstones: string[] = []
    /** when to run again without any other change (tombstone re-check, download retry) */
    let recheckAt = Infinity

    for (const id of remoteIds) {
      const entry = remotePhotos[id]
      if (!entry?.$isLoaded) continue

      if (deletedLocally.current.has(id)) {
        // deleted here before the entry existed / loaded: tombstone it now,
        // once. After that a revive from another device must win.
        if (!entry.deleted) entry.$jazz.set('deleted', true)
        deletedLocally.current.delete(id)
        continue
      }

      if (entry.deleted) {
        if (!photos.has(id)) continue
        heldTombstones.push(id)
        // a thumbnail-only copy (or a record another tab already removed)
        // goes — checked on every run, since the other tab's IndexedDB write
        // may land after the tombstone; a held original is unplaced once
        // and kept (placing it again is the revive)
        const firstTime = !handledTombstones.current.has(id)
        handledTombstones.current.add(id)
        if (firstTime) recheckAt = Math.min(recheckAt, now + 1_500)
        ;(async () => {
          const rec = await db.getPhoto(id)
          if (accountRef.current !== forAccount) return
          const fresh = remotePhotos[id]
          if (!fresh?.$isLoaded || !fresh.deleted) return // revived meanwhile
          if (!rec || rec.hasOriginal === false) dropLocal(id)
          else if (firstTime) unplace(id)
        })()
        continue
      }
      handledTombstones.current.delete(id)

      if (photos.has(id) || uploading.current.has(id)) continue
      const failure = thumbFailures.current.get(id)
      if (failure && (failure.attempts >= THUMB_MAX_ATTEMPTS || failure.nextAt > now)) continue
      const inline = entry.thumbData
      const thumbId = inline ? undefined : entry.$jazz.refs.thumb?.id
      if (!inline && !thumbId) continue
      toDownload++
      if (downloading.current.has(id)) continue
      downloading.current.add(id)
      ;(async () => {
        let done = false
        try {
          // another tab on this origin may already hold it (possibly the original)
          let rec = await db.getPhoto(id)
          if (!rec) {
            let blob: Blob | undefined
            if (inline) {
              blob = base64ToBlob(inline)
            } else if (thumbId) {
              // legacy entries that still point at a FileStream
              const started = Date.now()
              blob = await Promise.race([
                co.fileStream().loadAsBlob(thumbId),
                sleep(THUMB_LOAD_TIMEOUT).then(() => undefined),
              ])
              if (!blob) console.warn('sync: thumb unavailable', id, `after ${Date.now() - started}ms`)
            }
            if (!blob) return // retried with backoff
            if (accountRef.current !== forAccount || deletedLocally.current.has(id)) return
            rec = { id, name: entry.name, width: entry.width, height: entry.height, blob, thumb: blob, hasOriginal: false }
            const again = await db.getPhoto(id)
            if (again) rec = again
            else await db.savePhoto(rec)
          }
          if (accountRef.current !== forAccount) return
          done = true
          const view = rec
          const thumbUrl = URL.createObjectURL(view.thumb)
          setPhotos((prev) => {
            if (prev.has(id)) {
              URL.revokeObjectURL(thumbUrl)
              return prev
            }
            const next = new Map(prev)
            next.set(id, { id, name: view.name, width: view.width, height: view.height, thumbUrl })
            return next
          })
        } catch (err) {
          console.error('sync: download failed', id, err)
        } finally {
          downloading.current.delete(id)
          if (done) thumbFailures.current.delete(id)
          else {
            const prev = thumbFailures.current.get(id)
            const attempts = (prev?.attempts ?? 0) + 1
            thumbFailures.current.set(id, { attempts, nextAt: Date.now() + thumbRetryDelay(attempts) })
          }
        }
      })()
    }

    for (const view of photos.values()) {
      if (remoteIds.has(view.id)) continue
      toUpload++
      if (uploading.current.has(view.id)) continue
      uploading.current.add(view.id)
      ;(async () => {
        try {
          const rec = await db.getPhoto(view.id)
          if (!rec || accountRef.current !== forAccount) return
          const thumbData = await blobToBase64(rec.thumb)
          if (accountRef.current !== forAccount) return
          // deleted while the upload was in flight: land it as a tombstone
          const deleted = deletedLocally.current.delete(view.id)
          remotePhotos.$jazz.set(view.id, {
            name: rec.name,
            width: rec.width,
            height: rec.height,
            thumbData,
            deleted: deleted ? true : undefined,
          })
        } catch (err) {
          console.error('sync: upload failed', view.id, err)
        } finally {
          uploading.current.delete(view.id)
        }
      })()
    }

    setSyncStatus({ toUpload, toDownload, remoteDeleted: heldTombstones })

    // failed downloads are retried on a timer, not only when something else changes
    for (const [id, f] of thumbFailures.current) {
      if (f.attempts < THUMB_MAX_ATTEMPTS && remoteIds.has(id) && !photos.has(id)) recheckAt = Math.min(recheckAt, f.nextAt)
    }
    if (recheckAt === Infinity) return
    const timer = window.setTimeout(() => setRetryTick((t) => t + 1), Math.max(0, recheckAt - Date.now()) + 50)
    return () => window.clearTimeout(timer)
  }, [synced, root, accountId, remotePhotos, photos, setPhotos, dropLocal, unplace, retryTick])

  useEffect(() => {
    setSyncStatus({ active: synced, signedIn: authenticated })
    if (!synced) setSyncStatus({ toUpload: 0, toDownload: 0, remoteDeleted: [] })
  }, [synced, authenticated])

  const removePhoto = useCallback(
    (id: string) => {
      const entry = synced && remotePhotos ? remotePhotos[id] : undefined
      if (entry?.$isLoaded) {
        if (!entry.deleted) entry.$jazz.set('deleted', true)
      } else if (authRef.current) {
        // signed in but the entry isn't there yet (upload in flight, root
        // loading, or still connecting): apply it when it appears
        deletedLocally.current.add(id)
      }
    },
    [synced, remotePhotos],
  )

  return { active: synced, pending, resolveMerge, removePhoto, logOut }
}
