import { useSyncExternalStore } from 'react'

/**
 * Tiny external store so parts of the app outside the Jazz subtree (the
 * toolbar, App's busy indicator, the tray) can show sync status without
 * importing jazz-tools. Written only by the sync bridge and the boundary.
 */
export interface SyncStatus {
  /** the lazy Jazz subtree has mounted */
  loaded: boolean
  /** the Jazz subtree crashed; the user needs a way out */
  failed: boolean
  /** signed in and the account root is reconciled (effects running) */
  active: boolean
  /** signed in but not yet active (root loading, or the merge question is open) */
  signedIn: boolean
  /** the cloud book uses a newer format than this build understands */
  incompatible: boolean
  /** thumbnails still to send / receive */
  toUpload: number
  toDownload: number
  /** ids deleted on another device that this device keeps because it holds the original */
  remoteDeleted: string[]
}

let status: SyncStatus = {
  loaded: false,
  failed: false,
  active: false,
  signedIn: false,
  incompatible: false,
  toUpload: 0,
  toDownload: 0,
  remoteDeleted: [],
}
const listeners = new Set<() => void>()

export function setSyncStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch }
  const same = (Object.keys(next) as (keyof SyncStatus)[]).every((k) =>
    k === 'remoteDeleted' ? next.remoteDeleted.join() === status.remoteDeleted.join() : next[k] === status[k],
  )
  if (same) return
  status = next
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status, () => status)
}

/** Keys the bridge keeps in localStorage. Jazz keeps its own secret under `jazz-logged-in-secret`. */
export const SYNC_BASE_PREFIX = 'sequences-sync-base:'
export const JAZZ_SECRET_KEY = 'jazz-logged-in-secret'

/** Forget every per-account merge base (this-device operations, sign-out from a crash). */
export function clearSyncBase() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(SYNC_BASE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable */
  }
}
