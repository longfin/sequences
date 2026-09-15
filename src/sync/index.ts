import { Component, lazy, type ErrorInfo, type ReactNode } from 'react'
import { setSyncStatus } from './status'

/**
 * Entry point for the optional sync feature.
 *
 * Nothing in here imports jazz-tools. The Jazz-backed subtree is loaded with
 * React.lazy so the ~1.2MB library ships as its own chunk that only loads
 * when a sync target is configured at build time, and App paints before it.
 */
const API_KEY: string = import.meta.env.VITE_JAZZ_API_KEY ?? ''
const PEER: string = import.meta.env.VITE_JAZZ_SYNC_PEER ?? ''

export const SYNC_ENABLED = API_KEY.length > 0 || PEER.length > 0

export const SyncProvider = lazy(() => import('./jazz').then((m) => ({ default: m.SyncProvider })))
export const SyncBridge = lazy(() => import('./jazz').then((m) => ({ default: m.SyncBridge })))

export { JAZZ_SECRET_KEY, clearSyncBase, useSyncStatus } from './status'
export type { ProjectSync } from './useProjectSync'

/**
 * If the lazy chunk fails to load (stale index.html right after a deploy,
 * offline first visit) or the bridge throws, the local-first app must keep
 * working: render nothing and flag it so the toolbar can offer a way out.
 */
export class SyncErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('sync: subtree failed, continuing without sync', error, info.componentStack)
    setSyncStatus({ failed: true, loaded: false, active: false, signedIn: false })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
