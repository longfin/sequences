import { co } from 'jazz-tools'
import { useAccount, useIsAuthenticated, useLogOut } from 'jazz-tools/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from '../db'
import type { PhotoMap } from '../photoStore'
import { isValidProject, placedPhotoIds, type Project } from '../types'
import { SeqAccount } from './schema'
import { setSyncStatus } from './status'

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
  local: MergeSummary
  remote: MergeSummary
}

export type MergeChoice = 'remote' | 'local' | 'cancel'

export interface ProjectSync {
  /** true once signed in and the account root has loaded and been reconciled */
  active: boolean
  /** the login-time merge question, when both sides have placed photos */
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

type Phase = 'deciding' | 'synced'
interface Session {
  account: string
  phase: Phase
}

function parseRemote(json: string): Project | null {
  try {
    const parsed: unknown = JSON.parse(json)
    return isValidProject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function summarize(p: Project): MergeSummary {
  return { spreads: p.spreads.length, placed: placedPhotoIds(p).length }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The last project JSON this device and the account agreed on, kept per
 * account in localStorage. At bootstrap it tells "which side changed since
 * we last synced" so the merge question is only asked when both did.
 */
const BASE_KEY = 'sequences-sync-base:'
function readBase(account: string): string | null {
  try {
    return localStorage.getItem(BASE_KEY + account)
  } catch {
    return null
  }
}
function writeBase(account: string, json: string) {
  try {
    localStorage.setItem(BASE_KEY + account, json)
  } catch {
    /* storage unavailable: we just ask more often */
  }
}

/**
 * Bridges App state <-> the Jazz account root.
 *
 * Contract (see AGENTS.md "Sync"):
 * - Only thumbnails travel. A remote delete (tombstone) removes a photo from
 *   this device only if this device holds just the thumbnail; a held original
 *   is unplaced and kept in the tray. Placing it again revives the tombstone.
 * - Per account: decide once how to reconcile (remote has no placed photos →
 *   push local; local has no placed photos → take remote; both → ask), then
 *   keep both sides equal with the pull / push / reconcile effects.
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

  const lastPushed = useRef<string | null>(null)
  const lastRemoteApplied = useRef<string | null>(null)
  const uploading = useRef(new Set<string>())
  const downloading = useRef(new Set<string>())
  /** ids deleted locally whose remote entry didn't exist (or wasn't loaded) yet */
  const deletedLocally = useRef(new Set<string>())

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

  // ---- 1. per-account bootstrap ----
  useEffect(() => {
    if (!accountId || !root) {
      setSession(null)
      setPending(null)
      return
    }
    if (session?.account === accountId) return

    lastPushed.current = null
    lastRemoteApplied.current = null
    uploading.current.clear()
    downloading.current.clear()
    deletedLocally.current.clear()

    const remoteJson = root.projectJson
    const local = projectRef.current
    const localJson = local ? JSON.stringify(local) : ''
    const remote = remoteJson ? parseRemote(remoteJson) : null

    const base = readBase(accountId)

    if (remoteJson && !remote) console.warn('sync: cloud project is malformed; this device will overwrite it')
    if (!remote || remoteJson === localJson || placedPhotoIds(remote).length === 0 || localJson === base) {
      // nothing to reconcile: first device, equal, untouched cloud book, or
      // this device hasn't changed since it last synced (push is a no-op or
      // the pull effect brings the cloud's newer state in)
      setSession({ account: accountId, phase: 'synced' })
      return
    }
    if (!local || placedPhotoIds(local).length === 0 || remoteJson === base) {
      // this device has no book yet, or the cloud hasn't moved since we last
      // synced: our local edits simply win
      if (remoteJson !== base) applyRemote(remoteJson, remote)
      setSession({ account: accountId, phase: 'synced' })
      return
    }
    setPending({ local: summarize(local), remote: summarize(remote) })
    setSession({ account: accountId, phase: 'deciding' })
  }, [accountId, root, session?.account, applyRemote])

  const deciding = Boolean(root && session && session.account === accountId && session.phase === 'deciding')
  const synced = Boolean(root && session && session.account === accountId && session.phase === 'synced')
  const remotePhotos = root?.photos
  const remoteJson = root?.projectJson

  // keep the question current while it is open (the cached root may be stale
  // until the server catches up)
  useEffect(() => {
    if (!deciding || !remoteJson) return
    const remote = parseRemote(remoteJson)
    const local = projectRef.current
    if (!remote || !local) return
    setPending({ local: summarize(local), remote: summarize(remote) })
  }, [deciding, remoteJson])

  const resolveMerge = useCallback(
    (choice: MergeChoice) => {
      setPending(null)
      if (!root || !accountId) return
      if (choice === 'cancel') {
        logOut().catch((err) => console.error('sync: logout failed', err))
        return
      }
      if (choice === 'remote') {
        const json = root.projectJson
        const parsed = parseRemote(json)
        if (parsed) applyRemote(json, parsed)
      } else {
        // 'local': only the sequence is overwritten; cloud-only photos simply
        // download into this tray, so nothing is deleted anywhere
        const local = projectRef.current
        if (local) {
          const json = JSON.stringify(local)
          lastPushed.current = json
          root.$jazz.set('projectJson', json)
          writeBase(accountId, json)
        }
      }
      setSession({ account: accountId, phase: 'synced' })
    },
    [root, accountId, logOut, applyRemote],
  )

  // ---- 2a. project: pull ----
  useEffect(() => {
    if (!synced || !root || !remoteJson) return
    if (remoteJson === lastPushed.current) return
    if (project && remoteJson === JSON.stringify(project)) return
    const parsed = parseRemote(remoteJson)
    if (!parsed) {
      console.warn('sync: ignoring malformed remote project')
      return
    }
    applyRemote(remoteJson, parsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, root, remoteJson])

  // ---- 2b. project: push (debounced) ----
  useEffect(() => {
    if (!synced || !root || !project) return
    const json = JSON.stringify(project)
    if (json === root.projectJson) return
    // don't echo a state we just received; cleared after the first real push
    // so that reverting to that state later is pushed too
    if (json === lastRemoteApplied.current) return
    const timer = window.setTimeout(() => {
      // placing a photo that was tombstoned elsewhere revives it for everyone
      const rp = root.photos
      if (rp) {
        for (const id of placedPhotoIds(project)) {
          const entry = rp[id]
          if (entry?.$isLoaded && entry.deleted) entry.$jazz.set('deleted', false)
        }
      }
      lastPushed.current = json
      lastRemoteApplied.current = null
      root.$jazz.set('projectJson', json)
      if (accountRef.current) writeBase(accountRef.current, json)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [synced, root, project])

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
    let toDownload = 0
    let toUpload = 0

    for (const id of remoteIds) {
      const entry = remotePhotos[id]
      if (!entry?.$isLoaded) continue

      if (deletedLocally.current.has(id)) {
        // deleted here before the entry existed / loaded: tombstone it now
        if (!entry.deleted) entry.$jazz.set('deleted', true)
        continue
      }

      if (entry.deleted) {
        if (!photos.has(id)) continue
        // a held original is unplaced and kept; a thumbnail-only copy goes
        ;(async () => {
          const rec = await db.getPhoto(id)
          if (accountRef.current !== forAccount) return
          unplace(id)
          if (rec && rec.hasOriginal === false) dropLocal(id)
        })()
        continue
      }

      if (photos.has(id) || uploading.current.has(id)) continue
      toDownload++
      if (downloading.current.has(id)) continue
      const thumbId = entry.$jazz.refs.thumb?.id
      if (!thumbId) continue
      downloading.current.add(id)
      ;(async () => {
        try {
          // another tab on this origin may already hold it (possibly the original)
          let rec = await db.getPhoto(id)
          if (!rec) {
            const blob = await Promise.race([
              co.fileStream().loadAsBlob(thumbId),
              sleep(THUMB_LOAD_TIMEOUT).then(() => undefined),
            ])
            if (!blob) return // unavailable for now; a later reconcile retries
            if (accountRef.current !== forAccount || deletedLocally.current.has(id)) return
            rec = { id, name: entry.name, width: entry.width, height: entry.height, blob, thumb: blob, hasOriginal: false }
            const again = await db.getPhoto(id)
            if (again) rec = again
            else await db.savePhoto(rec)
          }
          if (accountRef.current !== forAccount) return
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
          const thumb = await co.fileStream().createFromBlob(rec.thumb, { owner: root.$jazz.owner })
          if (accountRef.current !== forAccount) return
          remotePhotos.$jazz.set(view.id, {
            name: rec.name,
            width: rec.width,
            height: rec.height,
            thumb,
            // deleted while the upload was in flight: land it as a tombstone
            deleted: deletedLocally.current.has(view.id) ? true : undefined,
          })
        } catch (err) {
          console.error('sync: upload failed', view.id, err)
        } finally {
          uploading.current.delete(view.id)
        }
      })()
    }

    setSyncStatus({ toUpload, toDownload })
  }, [synced, root, accountId, remotePhotos, photos, setPhotos, dropLocal, unplace])

  useEffect(() => {
    setSyncStatus({ active: synced, signedIn: authenticated })
    if (!synced) setSyncStatus({ toUpload: 0, toDownload: 0 })
  }, [synced, authenticated])

  const removePhoto = useCallback(
    (id: string) => {
      if (!synced || !remotePhotos) return
      const entry = remotePhotos[id]
      if (entry?.$isLoaded) {
        if (!entry.deleted) entry.$jazz.set('deleted', true)
      } else {
        deletedLocally.current.add(id)
      }
    },
    [synced, remotePhotos],
  )

  return { active: synced, pending, resolveMerge, removePhoto, logOut }
}
