import { co } from 'jazz-tools'
import { useAccount, useIsAuthenticated, useJazzContextValue, useLogOut } from 'jazz-tools/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from '../db'
import type { PhotoMap } from '../photoStore'
import { isValidProject, placedPhotoIds, type Project } from '../types'
import { SyncPhoto, SeqAccount, createdHere } from './schema'
import { JAZZ_SECRET_KEY, SYNC_BASE_PREFIX, onSyncEvent, setSyncStatus } from './status'

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
   *  but this device holds photos that came through a previous login. */
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

// Entries are resolved; each carries its thumbnail inline, so an entry that
// has loaded is complete. `$onError: 'catch'` keeps one unreadable entry from
// taking the root down.
const RESOLVE = { root: { photos: { $each: { $onError: 'catch' } } } } as const

const THUMB_LOAD_TIMEOUT = 60_000
const THUMB_MAX_ATTEMPTS = 6
/** a load that failed is retried soon, then with backoff */
const retryDelay = (attempts: number) => Math.min(2_000 * 4 ** (attempts - 1), 60_000)
/** while the server can't be reached, look again this often */
const OFFLINE_POLL = 2_000
/** after (re)connecting, give the server's newer state a moment to arrive before deciding */
const CONNECT_GRACE = 1_500
/** a root that looks blank on first contact gets this long to fill before we believe it */
const BLANK_ROOT_WAIT = 6_000

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
function readCredentialAccountId(): string | null {
  try {
    const raw = localStorage.getItem(JAZZ_SECRET_KEY)
    return raw ? (JSON.parse(raw).accountID ?? null) : null
  } catch {
    return null
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
  /** why 'blocked': waiting for the server, or a book this build can't read */
  reason?: 'offline' | 'incompatible'
}

function unplaced(p: Project, id: string): Project {
  if (!placedPhotoIds(p).includes(id)) return p
  return {
    ...p,
    spreads: p.spreads.map((s) => ({
      ...s,
      left: s.left.photoId === id ? { ...s.left, photoId: null } : s.left,
      right: s.right.photoId === id ? { ...s.right, photoId: null } : s.right,
    })),
  }
}

/**
 * Bridges App state <-> the Jazz account root.
 *
 * Contract (see AGENTS.md "Sync"):
 * - Only thumbnails travel. A remote delete (tombstone) unplaces the photo
 *   here; a thumbnail-only copy is then removed, a held original stays in
 *   the tray. Placing a held photo again revives the tombstone.
 * - Per account the bootstrap decides *imperatively* (it pushes or applies
 *   right away, so the incremental effects never get to reverse it), and
 *   only once the sync server is reachable: equal → nothing; this device
 *   unchanged since last sync → cloud wins; cloud empty, untouched or
 *   unchanged since last sync → this device wins (only if it has placed
 *   photos); this device has no placed photos → cloud wins; both changed →
 *   ask.
 * - All bookkeeping resets when the account id changes.
 */
export function useProjectSync({ project, setProject, updateProject, photos, setPhotos }: Args): ProjectSync {
  const authenticated = useIsAuthenticated()
  const me = useAccount(SeqAccount, { resolve: RESOLVE })
  const jazzLogOut = useLogOut() as unknown as () => Promise<void>
  const context = useJazzContextValue()
  // Right after a login the auth flag flips before Jazz has swapped the
  // context: `me` is still the previous (anonymous) account for a moment.
  // Only the account the stored credentials name counts as "signed in".
  const credentialId = readCredentialAccountId()
  const mismatch = authenticated && me.$isLoaded && me.$jazz.id !== credentialId
  const loaded = authenticated && me.$isLoaded && !mismatch ? me : null

  // If the running account and the stored credentials disagree for more than
  // a moment (seen in development with StrictMode's double effects: two
  // anonymous accounts get created and the credentials name the other one),
  // reload once: Jazz then starts from the credentials and the two agree.
  useEffect(() => {
    if (!mismatch) return
    const timer = window.setTimeout(() => {
      try {
        if (sessionStorage.getItem('sequences-sync-reloaded')) {
          console.error('sync: running account differs from the stored credentials; not syncing')
          return
        }
        sessionStorage.setItem('sequences-sync-reloaded', '1')
      } catch {
        /* ignore */
      }
      location.reload()
    }, 3_000)
    return () => window.clearTimeout(timer)
  }, [mismatch])
  const accountId = loaded ? loaded.$jazz.id : null
  const root = loaded ? loaded.root : undefined

  const [session, setSession] = useState<Session | null>(null)
  const [pending, setPending] = useState<MergePrompt | null>(null)
  /** bumped by a timer when something is due for another attempt without any other change */
  const [retryTick, setRetryTick] = useState(0)

  const lastPushed = useRef<string | null>(null)
  const lastRemoteApplied = useRef<string | null>(null)
  /**
   * The project changed here (user edit, tombstone unplace) and that change
   * hasn't been pushed yet. Only a dirty project is pushed — never "local
   * differs from cloud", which would re-push after every remote change and
   * make two devices overwrite each other forever — and while dirty, a
   * remote change is not applied over the pending edit.
   */
  const dirty = useRef(false)
  const uploading = useRef(new Set<string>())
  const downloading = useRef(new Set<string>())
  /** ids deleted locally before their remote entry existed or was loaded */
  const deletedLocally = useRef(new Set<string>())
  /** tombstones this device has already acted on (unplace happens once per transition) */
  const handledTombstones = useRef(new Set<string>())
  /** ids this device placed itself since the last push; only these may revive a tombstone */
  const placedHere = useRef(new Set<string>())
  /** loads that failed (entry or legacy thumb stream): attempt count and when to try again */
  const loadFailures = useRef(new Map<string, { attempts: number; nextAt: number }>())
  const bootstrappedFor = useRef<string | null>(null)
  const wasOffline = useRef(false)

  // latest values for async work and callbacks
  const projectRef = useRef(project)
  const photosRef = useRef(photos)
  photosRef.current = photos
  const accountRef = useRef(accountId)
  accountRef.current = accountId
  const authRef = useRef(authenticated)
  authRef.current = authenticated

  // a project change that did not come from applyRemote is a local edit:
  // it makes the project dirty, and ids newly placed with a photo this
  // device holds may revive a tombstone
  const appliedProject = useRef<Project | null>(null)
  if (projectRef.current !== project) {
    if (project && projectRef.current && project !== appliedProject.current) {
      dirty.current = true
      const before = new Set(placedPhotoIds(projectRef.current))
      for (const id of placedPhotoIds(project)) if (!before.has(id) && photos.has(id)) placedHere.current.add(id)
    }
    projectRef.current = project
  }

  /**
   * Has the sync server told us what it knows about the root? A peer object
   * exists while the socket is still connecting (or failing), so "not closed"
   * alone would say yes while offline; a known state only arrives over a
   * working connection.
   */
  const waitingSince = useRef<number | null>(null)
  const connected = useCallback(() => {
    type KnownState = { sessions?: Record<string, number> }
    type Peer = { closed: boolean; getKnownState?: (id: string) => KnownState | undefined }
    type Core = { knownState?: () => KnownState }
    const node = (context as { node?: { syncManager?: { getServerPeers?: (id: string) => Peer[] } } }).node
    if (!root) return false
    const id = root.$jazz.id
    const peers = node?.syncManager?.getServerPeers?.(id)
    const open = !!peers && peers.some((p) => !p.closed)
    const informed = peers?.find((p) => !p.closed && p.getKnownState?.(id) != null)
    if (informed) {
      // The server told us what it has. If it holds transactions for the root
      // that haven't reached us yet, deciding now would be deciding on a stale
      // (or empty) book: wait for them.
      const server = informed.getKnownState!(id)?.sessions ?? {}
      const local = (root.$jazz.raw as unknown as { core?: Core }).core?.knownState?.()?.sessions ?? {}
      const behind = Object.entries(server).some(([session, count]) => (local[session] ?? 0) < count)
      if (!behind) return true
      waitingSince.current ??= Date.now()
      return Date.now() - waitingSince.current > 8_000
    }
    // an open socket that never reports a known state for the root (it can
    // happen for a root created a moment ago) must not block forever
    if (open) {
      waitingSince.current ??= Date.now()
      return Date.now() - waitingSince.current > 8_000
    }
    waitingSince.current = null
    return false
  }, [context, root])

  const logOut = useCallback(async () => {
    await jazzLogOut()
    for (let i = 0; i < 30 && authRef.current; i++) await sleep(100)
    if (authRef.current) throw new Error('logout did not complete')
  }, [jazzLogOut])

  // another tab performed a this-device operation: leave the account here too
  useEffect(
    () =>
      onSyncEvent((type) => {
        if (type === 'logout' && authRef.current) jazzLogOut().catch(() => {})
      }),
    [jazzLogOut],
  )

  const applyRemote = useCallback(
    (json: string, parsed: Project) => {
      lastRemoteApplied.current = json
      // once something else has been applied, our last push is history:
      // the other device may legitimately return to that exact state
      lastPushed.current = null
      placedHere.current.clear()
      dirty.current = false
      appliedProject.current = parsed
      if (accountRef.current) writeBase(accountRef.current, json)
      setProject(parsed)
    },
    [setProject],
  )

  /**
   * Write this device's project to the cloud now. A tombstoned photo is
   * revived only if the user placed it here (a stale id inherited from a
   * pulled project must not resurrect a photo deleted elsewhere).
   */
  const pushNow = useCallback((r: NonNullable<typeof root>, local: Project) => {
    const json = encode(local)
    const rp = r.photos
    if (rp) {
      for (const id of placedPhotoIds(local)) {
        if (!placedHere.current.has(id) || !photosRef.current.has(id)) continue
        const entry = rp[id]
        if (entry?.$isLoaded && entry.deleted) entry.$jazz.set('deleted', false)
      }
    }
    placedHere.current.clear()
    lastPushed.current = json
    lastRemoteApplied.current = null
    dirty.current = false
    r.$jazz.set('projectJson', json)
    if (accountRef.current) writeBase(accountRef.current, json)
  }, [])

  // ---- 1. per-account bootstrap ----
  useEffect(() => {
    if (!accountId || !root) {
      setSession(null)
      setPending(null)
      setSyncStatus({ incompatible: false, offline: false })
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
      placedHere.current.clear()
      loadFailures.current.clear()
      if (bootstrappedFor.current !== null) deletedLocally.current.clear()
      bootstrappedFor.current = accountId
    }

    // A device that synced this account before holds a cached root. Without a
    // connection that cache is all Jazz can show, and "unchanged since last
    // sync" would be a lie that overwrites the cloud once we reconnect: decide
    // only against the server's state. A first contact has no cache to be
    // fooled by (the root comes from the server, or is ours to create).
    if (readBase(accountId) !== null && !connected()) {
      wasOffline.current = true
      setSyncStatus({ offline: true })
      setSession({ account: accountId, phase: 'blocked', reason: 'offline' })
      return
    }
    setSyncStatus({ offline: false })

    let cancelled = false
    ;(async () => {
      if (wasOffline.current) {
        wasOffline.current = false
        await sleep(CONNECT_GRACE)
        if (cancelled) return
      }
      const base = readBase(accountId)
      if (
        base === null &&
        !createdHere.has(accountId) &&
        !root.projectJson &&
        Object.keys(root.photos ?? {}).length === 0
      ) {
        // First time this device sees the account and the root looks blank.
        // Content can still be on its way from the server; a decision made
        // on a blank root would push this device's book over the real one.
        // Wait for content, up to a generous limit for a genuinely empty account.
        const until = Date.now() + BLANK_ROOT_WAIT
        while (Date.now() < until && !root.projectJson && Object.keys(root.photos ?? {}).length === 0) {
          await sleep(200)
          if (cancelled) return
        }
      }
      const remoteJson = root.projectJson
      const local = projectRef.current
      const localJson = local ? encode(local) : ''
      const remote = decode(remoteJson)
      const localPlaced = local ? placedPhotoIds(local).length : 0

      if (!remote.ok && remote.reason !== 'empty') {
        // a book we can't read: never overwrite it, never pull it
        console.warn('sync: cloud project is', remote.reason, '; sync paused on this device')
        setSyncStatus({ incompatible: remote.reason === 'newer' })
        setSession({ account: accountId, phase: 'blocked', reason: 'incompatible' })
        return
      }
      setSyncStatus({ incompatible: false })

      if (remote.ok && remoteJson === localJson) {
        writeBase(accountId, remoteJson)
        setSession({ account: accountId, phase: 'synced' })
        return
      }
      if (!remote.ok) {
        // empty account. If this device carries what a previous login left
        // (thumbnail-only photos, another account's merge base), ask first.
        const thumbOnly = photosRef.current.size > 0 && (await db.loadPhotos()).some((r) => r.hasOriginal === false)
        if (cancelled) return
        if (local && photosRef.current.size > 0 && (thumbOnly || hasOtherAccountBase(accountId))) {
          setPending({ kind: 'upload', local: summarize(local), remote: { spreads: 0, placed: 0 } })
          setSession({ account: accountId, phase: 'deciding' })
          return
        }
        // A sequence with nothing placed is not worth writing: another device's
        // first push may still be on its way, and last-write-wins would let this
        // blank overwrite it. Photos upload through the photo effect regardless.
        if (local && localPlaced > 0) pushNow(root, local)
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
  }, [accountId, root, session?.account, applyRemote, pushNow, connected])

  // while waiting for the server, look again regularly; a re-run of the
  // bootstrap decides as soon as the root has exchanged state with it
  const waitingForServer = Boolean(session && session.account === accountId && session.reason === 'offline')
  useEffect(() => {
    if (!waitingForServer) return
    const timer = window.setInterval(() => {
      if (connected()) setSession(null)
    }, OFFLINE_POLL)
    return () => window.clearInterval(timer)
  }, [waitingForServer, connected])

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
    if (dirty.current) return
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
    if (!synced || !root || !project || !dirty.current) return
    const json = encode(project)
    if (json === root.projectJson) {
      dirty.current = false
      return
    }
    // a sequence with nothing placed has nothing to tell an empty account
    // (another device's first push may be on its way; LWW must not let this blank win)
    if (!root.projectJson && placedPhotoIds(project).length === 0) return
    const timer = window.setTimeout(() => pushNow(root, project), 300)
    return () => window.clearTimeout(timer)
  }, [synced, root, project, pushNow])

  // ---- 2c. photos: reconcile ----
  /** forget the view; the record goes only if it is a thumbnail-only copy (checked in one transaction) */
  const dropLocal = useCallback(
    (id: string) => {
      db.deletePhotoIfThumbOnly(id).catch((err) => console.error('sync: drop failed', id, err))
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

  const unplace = useCallback((id: string) => updateProject((p) => unplaced(p, id)), [updateProject])

  useEffect(() => {
    if (!synced || !root || !remotePhotos) return
    const remoteIds = new Set(Object.keys(remotePhotos))
    const forAccount = accountId
    const now = Date.now()
    let toDownload = 0
    let toUpload = 0
    const heldTombstones: string[] = []
    /** when to run again without any other change (tombstone re-check, load retry) */
    let recheckAt = Infinity
    const dueForRetry = (id: string) => {
      const f = loadFailures.current.get(id)
      if (!f) return true
      if (f.attempts >= THUMB_MAX_ATTEMPTS) return false
      if (f.nextAt > now) {
        recheckAt = Math.min(recheckAt, f.nextAt)
        return false
      }
      return true
    }
    const noteFailure = (id: string) => {
      const attempts = (loadFailures.current.get(id)?.attempts ?? 0) + 1
      loadFailures.current.set(id, { attempts, nextAt: Date.now() + retryDelay(attempts) })
    }

    for (const id of remoteIds) {
      const entry = remotePhotos[id]

      if (!entry?.$isLoaded) {
        // unreadable or not yet delivered: count it and nudge a load with backoff
        if (!photos.has(id)) toDownload++
        const refId = remotePhotos.$jazz.refs[id]?.id
        if (refId && dueForRetry(id)) {
          noteFailure(id)
          SyncPhoto.load(refId).catch(() => {})
        }
        continue
      }
      loadFailures.current.delete(id)

      if (deletedLocally.current.has(id)) {
        // deleted here before the entry existed / loaded: tombstone it now,
        // once. After that a revive from another device must win.
        if (!entry.deleted) entry.$jazz.set('deleted', true)
        deletedLocally.current.delete(id)
        continue
      }

      if (entry.deleted) {
        // a stale placement inherited from a pulled project must not keep
        // the id alive in the sequence
        if (!photos.has(id)) {
          if (projectRef.current && placedPhotoIds(projectRef.current).includes(id)) unplace(id)
          continue
        }
        heldTombstones.push(id)
        // the thumbnail-only copy goes (checked on every run, in one IDB
        // transaction, so another tab's write can't be swept away); a held
        // original is unplaced once and kept
        const firstTime = !handledTombstones.current.has(id)
        handledTombstones.current.add(id)
        if (firstTime) recheckAt = Math.min(recheckAt, now + 1_500)
        ;(async () => {
          const rec = await db.getPhoto(id)
          if (accountRef.current !== forAccount) return
          const fresh = remotePhotos[id]
          if (!fresh?.$isLoaded || !fresh.deleted) return // revived meanwhile
          if (!rec || rec.hasOriginal === false) {
            unplace(id)
            dropLocal(id)
          } else if (firstTime) {
            unplace(id)
          }
        })()
        continue
      }
      handledTombstones.current.delete(id)

      if (photos.has(id) || uploading.current.has(id)) continue
      const inline = entry.thumbData
      const thumbId = inline ? undefined : entry.$jazz.refs.thumb?.id
      if (!inline && !thumbId) continue
      toDownload++
      if (!dueForRetry(id) || downloading.current.has(id)) continue
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
              blob = await Promise.race([
                co.fileStream().loadAsBlob(thumbId),
                sleep(THUMB_LOAD_TIMEOUT).then(() => undefined),
              ])
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
          if (done) loadFailures.current.delete(id)
          else noteFailure(id)
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
      placedHere.current.delete(id)
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
