import { co } from 'jazz-tools'
import { useAccount, useIsAuthenticated } from 'jazz-tools/react'
import { useCallback, useEffect, useRef } from 'react'
import * as db from '../db'
import type { PhotoMap } from '../photoStore'
import type { PhotoRecord, Project } from '../types'
import { SeqAccount } from './schema'

interface Args {
  project: Project | null
  setProject: (p: Project) => void
  photos: PhotoMap
  setPhotos: (fn: (prev: PhotoMap) => PhotoMap) => void
}

export interface ProjectSync {
  /** true once signed in and the account root has loaded */
  active: boolean
  /** call after a local delete so the other devices drop the photo too */
  removePhoto: (id: string) => void
  /** call on reset so the other devices reset too */
  clearRemote: () => void
}

const RESOLVE = { root: { photos: { $each: { thumb: true } } } } as const

/**
 * Bridges App state <-> the Jazz account root.
 *
 * Project: LWW on the JSON string. Echo suppression via two refs:
 *   lastPushed        – json we wrote to Jazz (ignore when it comes back)
 *   lastRemoteApplied – json we applied from Jazz (don't push it back)
 * Photos: union by id. Remote entries missing locally are downloaded
 * (thumb only, stored as both blob and thumb). Local entries missing
 * remotely are uploaded. An id that *was* remote and disappears is a
 * remote delete and is removed locally.
 */
export function useProjectSync({ project, setProject, photos, setPhotos }: Args): ProjectSync {
  const authenticated = useIsAuthenticated()
  const me = useAccount(SeqAccount, { resolve: RESOLVE })
  const root = authenticated && me.$isLoaded ? me.root : undefined

  const lastPushed = useRef<string | null>(null)
  const lastRemoteApplied = useRef<string | null>(null)
  const uploading = useRef(new Set<string>())
  const downloading = useRef(new Set<string>())
  const knownRemote = useRef(new Set<string>())

  // ---- project: pull ----
  const remoteJson = root?.projectJson
  useEffect(() => {
    if (!root || !remoteJson) return
    if (remoteJson === lastPushed.current) return
    if (project && remoteJson === JSON.stringify(project)) return
    let parsed: Project
    try {
      parsed = JSON.parse(remoteJson)
    } catch {
      return
    }
    if (!Array.isArray(parsed?.spreads)) return
    lastRemoteApplied.current = remoteJson
    setProject(parsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, remoteJson])

  // ---- project: push (debounced) ----
  useEffect(() => {
    if (!root || !project) return
    const json = JSON.stringify(project)
    if (json === root.projectJson) return
    if (json === lastRemoteApplied.current) return
    const timer = window.setTimeout(() => {
      lastPushed.current = json
      root.$jazz.set('projectJson', json)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [root, project])

  // ---- photos: reconcile ----
  const remotePhotos = root?.photos
  useEffect(() => {
    if (!root || !remotePhotos) return
    const remoteIds = new Set(Object.keys(remotePhotos))

    // remote deletes
    for (const id of knownRemote.current) {
      if (!remoteIds.has(id) && photos.has(id)) {
        knownRemote.current.delete(id)
        db.deletePhoto(id)
        setPhotos((prev) => {
          const victim = prev.get(id)
          if (victim) URL.revokeObjectURL(victim.thumbUrl)
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      }
    }

    // uploads
    for (const view of photos.values()) {
      if (remoteIds.has(view.id) || uploading.current.has(view.id)) continue
      uploading.current.add(view.id)
      ;(async () => {
        try {
          const rec = await db.getPhoto(view.id)
          if (!rec) return
          const owner = root.$jazz.owner
          const thumb = await co.fileStream().createFromBlob(rec.thumb, { owner })
          remotePhotos.$jazz.set(view.id, {
            name: rec.name,
            width: rec.width,
            height: rec.height,
            thumb,
          })
          knownRemote.current.add(view.id)
        } catch (err) {
          console.error('sync upload failed', view.id, err)
        } finally {
          uploading.current.delete(view.id)
        }
      })()
    }

    // downloads
    for (const id of remoteIds) {
      const entry = remotePhotos[id]
      if (!entry?.$isLoaded) continue
      if (photos.has(id)) {
        knownRemote.current.add(id)
        continue
      }
      if (downloading.current.has(id) || uploading.current.has(id)) continue
      const stream = entry.thumb
      if (!stream?.$isLoaded || !stream.isBinaryStreamEnded()) continue
      const blob = stream.toBlob()
      if (!blob) continue
      downloading.current.add(id)
      ;(async () => {
        try {
          const rec: PhotoRecord = {
            id,
            name: entry.name,
            width: entry.width,
            height: entry.height,
            blob,
            thumb: blob,
          }
          await db.savePhoto(rec)
          knownRemote.current.add(id)
          setPhotos((prev) => {
            if (prev.has(id)) return prev
            const next = new Map(prev)
            next.set(id, {
              id,
              name: rec.name,
              width: rec.width,
              height: rec.height,
              thumbUrl: URL.createObjectURL(rec.thumb),
            })
            return next
          })
        } finally {
          downloading.current.delete(id)
        }
      })()
    }
  }, [root, remotePhotos, photos, setPhotos])

  const removePhoto = useCallback(
    (id: string) => {
      knownRemote.current.delete(id)
      if (remotePhotos && Object.prototype.hasOwnProperty.call(remotePhotos, id)) {
        remotePhotos.$jazz.delete(id)
      }
    },
    [remotePhotos],
  )

  const clearRemote = useCallback(() => {
    if (!root || !remotePhotos) return
    for (const id of Object.keys(remotePhotos)) remotePhotos.$jazz.delete(id)
    knownRemote.current.clear()
    lastPushed.current = ''
    root.$jazz.set('projectJson', '')
  }, [root, remotePhotos])

  return { active: Boolean(root), removePhoto, clearRemote }
}
