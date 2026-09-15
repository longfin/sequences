import { useEffect, type MutableRefObject } from 'react'
import type { PhotoMap } from '../photoStore'
import type { Project } from '../types'
import { SyncMergeDialog } from './SyncMergeDialog'
import { useProjectSync, type ProjectSync } from './useProjectSync'

interface Props {
  project: Project | null
  setProject: (p: Project) => void
  updateProject: (fn: (p: Project) => Project) => void
  photos: PhotoMap
  setPhotos: (fn: (prev: PhotoMap) => PhotoMap) => void
  /** App reads the imperative API (removePhoto, logOut, active) through this ref */
  apiRef: MutableRefObject<ProjectSync | null>
}

/**
 * Mounts the sync hook (hooks can't be called conditionally, and App must
 * work without a Jazz provider) and renders the login-time merge question.
 */
export function SyncBridge({ apiRef, ...args }: Props) {
  const api = useProjectSync(args)
  useEffect(() => {
    apiRef.current = api
    return () => {
      apiRef.current = null
    }
  }, [api, apiRef])
  if (!api.pending) return null
  return <SyncMergeDialog prompt={api.pending} onChoose={api.resolveMerge} />
}
