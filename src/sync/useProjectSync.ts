import { co } from 'jazz-tools'
import { useAccount, useIsAuthenticated, useLogOut } from 'jazz-tools/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from '../db'
import type { PhotoMap } from '../photoStore'
import { isValidProject, placedPhotoIds, type PhotoRecord, type Project } from '../types'
import { SeqAccount } from './schema'

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
  /** the login-time merge question, when both sides have real work */
  pending: MergePrompt | null
  resolveMerge: (choice: MergeChoice) => void
  /** call after a confirmed local delete so the other devices drop the photo too */
  removePhoto: (id: string) => void
  /** leave the account on this device; resolves once the anonymous context is up */
  logOut: () => Promise<void>
}

// A thumb that can't be loaded (unauthorized / not yet on the server) must
// not take the whole root down with it: `$onError: 'catch'` yields null.
const RESOLVE = {
  root: { photos: { $each: { $onError: 'catch', thumb: { $onError: 'catch' } } } },
} as const

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

/**
 * Bridges App state <-> the Jazz account root.
 *
 * Lifecycle per account:
 *   1. root loads → decide how to reconcile this device with the account:
 *      remote empty → push local; local has no placed photos → take remote;
 *      otherwise ask the user (phase 'deciding', see resolveMerge).
 *   2. phase 'synced' → three effects keep the two sides equal:
 *      project pull / project push (LWW on the JSON string, with echo
 *      suppression via lastPushed / lastRemoteApplied) and photo reconcile
 *      (upload local-only, download remote-only, apply tombstones).
 *
 * All bookkeeping is reset whenever the account id changes, so logging out
 * and into another account never reinterprets the old account's state.
 */
export function useProjectSync({ project, setProject, updateProject, photos, setPhotos }: Args): ProjectSync {
  const authenticated = useIsAuthenticated()
  const me = useAccount(SeqAccount, { resolve: RESOLVE })
  const jazzLogOut = useLogOut() as unknown as () => Promise<void>
  const loaded = authenticated && me.$isLoaded ? me : null
  const accountId = loaded ? loaded.$jazz.id : null
  const root = loaded ? loaded.root : undefined
  const accountRef = useRef(accountId)
  accountRef.current = accountId

  const logOut = useCallback(async () => {
    await jazzLogOut()
  }, [jazzLogOut])

  const [session, setSession] = useState<Session | null>(null)
  const [pending, setPending] = useState<MergePrompt | null>(null)
  const pendingRemote = useRef<{ json: string; project: Project } | null>(null)

  const lastPushed = useRef<string | null>(null)
  const lastRemoteApplied = useRef<string | null>(null)
  const uploading = useRef(new Set<string>())
  const downloading = useRef(new Set<string>())

  // latest values for use inside async work without re-subscribing
  const projectRef = useRef(project)
  projectRef.current = project
  const photosRef = useRef(photos)
  photosRef.current = photos

  const applyRemote = useCallback(
    (json: string, parsed: Project) => {
      lastRemoteApplied.current = json
      setProject(parsed)
    },
    [setProject],
  )

  // ---- 1. per-account bootstrap ----
  useEffect(() => {
    if (!accountId || !root) {
      setSession(null)
      setPending(null)
      pendingRemote.current = null
      return
    }
    if (session?.account === accountId) return

    lastPushed.current = null
    lastRemoteApplied.current = null
    uploading.current.clear()
    downloading.current.clear()

    const remoteJson = root.projectJson
    const local = projectRef.current
    const localJson = local ? JSON.stringify(local) : ''
    const remote = remoteJson ? parseRemote(remoteJson) : null

    if (!remote || remoteJson === localJson) {
      // first device for this account, or nothing to reconcile
      setSession({ account: accountId, phase: 'synced' })
      return
    }
    if (!local || placedPhotoIds(local).length === 0) {
      applyRemote(remoteJson, remote)
      setSession({ account: accountId, phase: 'synced' })
      return
    }
    pendingRemote.current = { json: remoteJson, project: remote }
    setPending({ local: summarize(local), remote: summarize(remote) })
    setSession({ account: accountId, phase: 'deciding' })
  }, [accountId, root, session?.account, applyRemote])

  const synced = Boolean(root && session && session.account === accountId && session.phase === 'synced')
  const remotePhotos = root?.photos

  const resolveMerge = useCallback(
    (choice: MergeChoice) => {
      const held = pendingRemote.current
      pendingRemote.current = null
      setPending(null)
      if (!root || !accountId) return
      if (choice === 'cancel') {
        logOut()
        return
      }
      if (choice === 'remote' && held) {
        applyRemote(held.json, held.project)
      } else if (choice === 'local') {
        const local = projectRef.current
        if (local && root.photos) {
          // photos only the cloud knows about are being replaced by this device's book
          for (const id of Object.keys(root.photos)) {
            const entry = root.photos[id]
            if (entry?.$isLoaded && !entry.deleted && !photosRef.current.has(id)) {
              entry.$jazz.set('deleted', true)
            }
          }
          const json = JSON.stringify(local)
          lastPushed.current = json
          root.$jazz.set('projectJson', json)
        }
      }
      setSession({ account: accountId, phase: 'synced' })
    },
    [root, accountId, logOut, applyRemote],
  )

  // ---- 2a. project: pull ----
  const remoteJson = root?.projectJson
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
    if (json === lastRemoteApplied.current) return
    const timer = window.setTimeout(() => {
      lastPushed.current = json
      root.$jazz.set('projectJson', json)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [synced, root, project])

  // ---- 2c. photos: reconcile ----
  const removeLocal = useCallback(
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
      updateProject((p) => ({
        ...p,
        spreads: p.spreads.map((s) => ({
          ...s,
          left: s.left.photoId === id ? { ...s.left, photoId: null } : s.left,
          right: s.right.photoId === id ? { ...s.right, photoId: null } : s.right,
        })),
      }))
    },
    [setPhotos, updateProject],
  )

  useEffect(() => {
    if (!synced || !root || !remotePhotos) return
    const remoteIds = new Set(Object.keys(remotePhotos))

    // downloads and tombstones
    for (const id of remoteIds) {
      const entry = remotePhotos[id]
      if (!entry?.$isLoaded) continue
      if (entry.deleted) {
        if (photos.has(id)) removeLocal(id)
        continue
      }
      if (photos.has(id) || downloading.current.has(id) || uploading.current.has(id)) continue
      const stream = entry.thumb
      if (!stream?.$isLoaded || !stream.isBinaryStreamEnded()) continue
      const blob = stream.toBlob()
      if (!blob) continue
      downloading.current.add(id)
      const rec: PhotoRecord = {
        id,
        name: entry.name,
        width: entry.width,
        height: entry.height,
        blob,
        thumb: blob,
        hasOriginal: false,
      }
      const forAccount = accountId
      ;(async () => {
        try {
          await db.savePhoto(rec)
          if (accountRef.current !== forAccount) {
            // the account changed (or the user reset) while this was in flight
            await db.deletePhoto(id)
            return
          }
          // created outside the updater: StrictMode runs updaters twice
          const thumbUrl = URL.createObjectURL(rec.thumb)
          setPhotos((prev) => {
            if (prev.has(id)) {
              URL.revokeObjectURL(thumbUrl)
              return prev
            }
            const next = new Map(prev)
            next.set(id, { id, name: rec.name, width: rec.width, height: rec.height, thumbUrl })
            return next
          })
        } finally {
          downloading.current.delete(id)
        }
      })()
    }

    // uploads: local photos the account has never seen (tombstoned ids are in remoteIds, so they stay put)
    for (const view of photos.values()) {
      if (remoteIds.has(view.id) || uploading.current.has(view.id)) continue
      uploading.current.add(view.id)
      ;(async () => {
        try {
          const rec = await db.getPhoto(view.id)
          if (!rec) return
          const thumb = await co.fileStream().createFromBlob(rec.thumb, { owner: root.$jazz.owner })
          remotePhotos.$jazz.set(view.id, { name: rec.name, width: rec.width, height: rec.height, thumb })
        } catch (err) {
          console.error('sync: upload failed', view.id, err)
        } finally {
          uploading.current.delete(view.id)
        }
      })()
    }
  }, [synced, root, accountId, remotePhotos, photos, setPhotos, removeLocal])

  const removePhoto = useCallback(
    (id: string) => {
      if (!synced || !remotePhotos) return
      const entry = remotePhotos[id]
      if (entry?.$isLoaded && !entry.deleted) entry.$jazz.set('deleted', true)
    },
    [synced, remotePhotos],
  )

  return { active: synced, pending, resolveMerge, removePhoto, logOut }
}
