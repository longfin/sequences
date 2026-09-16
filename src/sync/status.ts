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
  /** signed in but the sync server can't be reached; nothing is decided or written until it can */
  offline: boolean
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
  offline: false,
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

/**
 * Other tabs on this origin share IndexedDB and the Jazz session but run
 * their own bridge. A this-device operation (Reset, Load, sign-out) tells
 * them so they stop syncing and reload instead of writing stale state back.
 */
export type SyncEvent = 'logout' | 'reload'
const CHANNEL = 'sequences-sync'
// BroadcastChannel only skips the posting channel object, not the posting
// tab: tag messages so a tab ignores its own
const TAB_ID = Math.random().toString(36).slice(2)

export function postSyncEvent(type: SyncEvent) {
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage({ type, from: TAB_ID })
    ch.close()
  } catch {
    /* no BroadcastChannel */
  }
}

export function onSyncEvent(handler: (type: SyncEvent) => void): () => void {
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e) => {
      const msg = e.data as { type?: SyncEvent; from?: string } | undefined
      if (!msg || msg.from === TAB_ID) return
      if (msg.type === 'logout' || msg.type === 'reload') handler(msg.type)
    }
    return () => ch.close()
  } catch {
    return () => {}
  }
}
