import { Component, lazy, type ErrorInfo, type ReactNode } from 'react'

/**
 * Entry point for the optional sync feature.
 *
 * Nothing in here imports jazz-tools. The Jazz-backed subtree is loaded with
 * React.lazy so the ~1.2MB library ships as its own chunk that only loads
 * when an API key is configured at build time, and App paints before it.
 */
const API_KEY: string = import.meta.env.VITE_JAZZ_API_KEY ?? ''

export const SYNC_ENABLED = API_KEY.length > 0

export const SyncProvider = lazy(() => import('./jazz').then((m) => ({ default: m.SyncProvider })))
export const SyncBridge = lazy(() => import('./jazz').then((m) => ({ default: m.SyncBridge })))

export { useSyncStatus } from './status'
export type { ProjectSync } from './useProjectSync'

/**
 * If the lazy chunk fails to load (stale index.html right after a deploy,
 * offline first visit), the local-first app must keep working: render
 * nothing instead of unmounting the root.
 */
export class SyncErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('sync: subtree failed, continuing without sync', error, info.componentStack)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
