export type Layout = 'full' | 'margin'

export interface PageState {
  photoId: string | null
  layout: Layout
}

export interface Spread {
  id: string
  left: PageState
  right: PageState
}

export interface Project {
  spreads: Spread[]
  /** page width / height */
  pageRatio: number
  grayscale: boolean
}

export interface PhotoMeta {
  id: string
  name: string
  width: number
  height: number
}

export interface PhotoRecord extends PhotoMeta {
  /** the original file, or the thumbnail again when `hasOriginal` is false */
  blob: Blob
  thumb: Blob
  /**
   * false for photos that arrived through sync: only the ≤600px thumbnail
   * exists on this device. Records written before this flag existed are
   * treated as originals (`hasOriginal !== false`).
   */
  hasOriginal: boolean
}

export function placedPhotoIds(project: Project): string[] {
  return project.spreads.flatMap((s) => [s.left.photoId, s.right.photoId]).filter(Boolean) as string[]
}

function isPage(x: unknown): x is PageState {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return (
    (p.photoId === null || typeof p.photoId === 'string') &&
    (p.layout === 'full' || p.layout === 'margin')
  )
}

/** Structural check for project documents coming from files or sync. */
export function isValidProject(x: unknown): x is Project {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  if (typeof p.pageRatio !== 'number' || !Number.isFinite(p.pageRatio) || p.pageRatio <= 0) return false
  if (typeof p.grayscale !== 'boolean') return false
  if (!Array.isArray(p.spreads)) return false
  return p.spreads.every(
    (s: unknown) =>
      !!s &&
      typeof s === 'object' &&
      typeof (s as Spread).id === 'string' &&
      isPage((s as Spread).left) &&
      isPage((s as Spread).right),
  )
}

export type DragPayload =
  | { type: 'photo'; photoId: string; from: 'tray' }
  | { type: 'photo'; photoId: string; from: 'slot'; spreadId: string; side: 'left' | 'right' }
  | { type: 'spread'; spreadId: string }

export const PAGE_RATIOS = [
  { labelKey: 'ratioPortrait45', value: 4 / 5 },
  { labelKey: 'ratioPortrait34', value: 3 / 4 },
  { labelKey: 'ratioPortrait23', value: 2 / 3 },
  { labelKey: 'ratioSquare', value: 1 },
  { labelKey: 'ratioLandscape54', value: 5 / 4 },
  { labelKey: 'ratioLandscape43', value: 4 / 3 },
] as const

export function emptyPage(): PageState {
  return { photoId: null, layout: 'margin' }
}

export function newSpread(): Spread {
  return { id: crypto.randomUUID(), left: emptyPage(), right: emptyPage() }
}

export function defaultProject(): Project {
  return {
    spreads: [newSpread(), newSpread(), newSpread(), newSpread()],
    pageRatio: 4 / 5,
    grayscale: false,
  }
}
