import { useEffect, type MutableRefObject } from 'react'
import type { PhotoMap } from '../photoStore'
import type { Project } from '../types'
import { useProjectSync, type ProjectSync } from './useProjectSync'

interface Props {
  project: Project | null
  setProject: (p: Project) => void
  photos: PhotoMap
  setPhotos: (fn: (prev: PhotoMap) => PhotoMap) => void
  /** App reads removePhoto / clearRemote through this ref */
  apiRef: MutableRefObject<ProjectSync | null>
}

/**
 * Renders nothing. Exists so App can mount the sync hook only when a
 * JazzReactProvider is present (hooks can't be called conditionally).
 */
export function SyncBridge({ apiRef, ...args }: Props) {
  const api = useProjectSync(args)
  useEffect(() => {
    apiRef.current = api
    return () => {
      apiRef.current = null
    }
  }, [api, apiRef])
  return null
}
