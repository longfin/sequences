import { lazy } from 'react'

/**
 * Entry point for the optional sync feature.
 *
 * Nothing in here imports jazz-tools. The Jazz-backed components are loaded
 * with React.lazy so the ~1.4MB library only ships to browsers that actually
 * render them, i.e. only when an API key is configured at build time.
 */
const API_KEY: string = import.meta.env.VITE_JAZZ_API_KEY ?? ''

export const SYNC_ENABLED = API_KEY.length > 0

export const SyncProvider = lazy(() => import('./jazz').then((m) => ({ default: m.SyncProvider })))
export const SyncMenu = lazy(() => import('./jazz').then((m) => ({ default: m.SyncMenu })))
export const SyncBridge = lazy(() => import('./jazz').then((m) => ({ default: m.SyncBridge })))

export type { ProjectSync } from './useProjectSync'
