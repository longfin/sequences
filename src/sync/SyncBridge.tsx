import { useEffect, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import type { PhotoMap } from '../photoStore'
import type { Project } from '../types'
import { setSyncStatus } from './status'
import { SyncMenu } from './SyncMenu'
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
  /** toolbar element the Sync menu is portalled into */
  menuSlot: HTMLElement | null
}

/**
 * The whole Jazz-dependent subtree: runs the sync hook, renders the toolbar
 * menu into its slot (so App can paint before this chunk arrives) and shows
 * the login-time merge question.
 */
export function SyncBridge({ apiRef, menuSlot, ...args }: Props) {
  const api = useProjectSync(args)
  useEffect(() => {
    apiRef.current = api
    return () => {
      apiRef.current = null
    }
  }, [api, apiRef])
  useEffect(() => {
    setSyncStatus({ loaded: true })
    return () => setSyncStatus({ loaded: false, active: false, signedIn: false, toUpload: 0, toDownload: 0 })
  }, [])
  return (
    <>
      {menuSlot && createPortal(<SyncMenu />, menuSlot)}
      {api.pending && <SyncMergeDialog prompt={api.pending} onChoose={api.resolveMerge} />}
    </>
  )
}
