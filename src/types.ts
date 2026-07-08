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
  blob: Blob
  thumb: Blob
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
