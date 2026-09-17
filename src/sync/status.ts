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
/** accounts this device created the root for, kept across reloads (see below) */
export const SYNC_CREATED_PREFIX = 'sequences-sync-created:'
export const JAZZ_SECRET_KEY = 'jazz-logged-in-secret'

/**
 * "This device created the account" comes in two strengths, and mixing them
 * up costs data:
 *
 * - **This page load** (`createdThisSession`, in memory, never persisted).
 *   The root was created here moments ago, so nothing else can have written
 *   it and there is nothing cached to be fooled by. Only this may exempt a
 *   device from the "decide only while the server has reported" gate. A
 *   persisted mark must never do it: after a reload the cached root can be
 *   arbitrarily stale (another device moved the book on while we were away),
 *   and deciding from it silently overwrites the cloud on reconnect.
 * - **Ever, on this device** (`isCreatedHere`, localStorage). Used only to
 *   skip the blank-root wait, which is a spinner, not a correctness gate:
 *   by the time it is consulted the server has already reported.
 */
const createdThisSession = new Set<string>()

/** the root for this account was created in this page load */
export function noteCreatedHere(account: string) {
  createdThisSession.add(account)
}

export function wasCreatedThisSession(account: string): boolean {
  return createdThisSession.has(account)
}

/**
 * Remember across reloads that this device created the account. Called only
 * for an account the user is actually signed in to: Jazz creates an
 * anonymous account (with creationProps) on every fresh context, so marking
 * from the migration would leave a key behind on every sign-out.
 */
export function persistCreatedHere(account: string) {
  try {
    if (localStorage.getItem(SYNC_CREATED_PREFIX + account) !== '1') {
      localStorage.setItem(SYNC_CREATED_PREFIX + account, '1')
    }
  } catch {
    /* storage unavailable: we just wait out the blank-root wait once more */
  }
}

/** did this device ever create this account's root? (blank-root wait only) */
export function isCreatedHere(account: string): boolean {
  try {
    return localStorage.getItem(SYNC_CREATED_PREFIX + account) === '1'
  } catch {
    return false
  }
}

/**
 * This device left the account (signed out). Whatever it created is over: a
 * later login in this same page must decide against the server like any
 * other device. The persisted mark is kept — it only ever skips a spinner.
 */
export function forgetCreatedThisSession(account: string) {
  createdThisSession.delete(account)
}

/**
 * Forget every per-account merge base and creator mark (this-device
 * operations, sign-out from a crash). A device that left the account is no
 * longer its creator as far as this build is concerned: it must decide
 * against the server again rather than trust its cached root.
 */
export function clearSyncBase() {
  createdThisSession.clear()
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(SYNC_BASE_PREFIX) || k?.startsWith(SYNC_CREATED_PREFIX)) keys.push(k)
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
