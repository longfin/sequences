import { useSyncExternalStore } from 'react'

/**
 * Tiny external store so parts of the app outside the Jazz subtree (the
 * toolbar, App's busy indicator) can show sync status without importing
 * jazz-tools. Written only by the sync bridge.
 */
export interface SyncStatus {
  /** the lazy Jazz subtree has mounted */
  loaded: boolean
  /** signed in and the account root is reconciled (effects running) */
  active: boolean
  /** signed in but not yet active (root loading, or the merge question is open) */
  signedIn: boolean
  /** thumbnails still to send / receive */
  toUpload: number
  toDownload: number
}

let status: SyncStatus = { loaded: false, active: false, signedIn: false, toUpload: 0, toDownload: 0 }
const listeners = new Set<() => void>()

export function setSyncStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch }
  if (
    next.loaded === status.loaded &&
    next.active === status.active &&
    next.signedIn === status.signedIn &&
    next.toUpload === status.toUpload &&
    next.toDownload === status.toDownload
  ) {
    return
  }
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
