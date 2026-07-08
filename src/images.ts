import type { PhotoRecord } from './types'

const THUMB_MAX = 600

export async function importFile(file: File): Promise<PhotoRecord> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  const scale = Math.min(1, THUMB_MAX / Math.max(width, height))
  const tw = Math.max(1, Math.round(width * scale))
  const th = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, tw, th)
  bitmap.close()

  const thumb = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('썸네일 생성 실패'))),
      'image/jpeg',
      0.85,
    )
  })

  return {
    id: crypto.randomUUID(),
    name: file.name,
    width,
    height,
    blob: file,
    thumb,
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
