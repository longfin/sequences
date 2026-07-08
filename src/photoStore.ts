import type { PhotoMeta } from './types'

export interface PhotoView extends PhotoMeta {
  thumbUrl: string
}

export type PhotoMap = Map<string, PhotoView>
