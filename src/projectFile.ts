import type { PhotoRecord, Project } from './types'

const FORMAT = 'sequences-project'
const VERSION = 1

interface FilePhoto {
  id: string
  name: string
  width: number
  height: number
  blob: string
  thumb: string
}

interface ProjectFile {
  format: typeof FORMAT
  version: number
  project: Project
  photos: FilePhoto[]
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

async function dataURLToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

export async function buildProjectFile(
  project: Project,
  records: PhotoRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const photos: FilePhoto[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    photos.push({
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      blob: await blobToDataURL(r.blob),
      thumb: await blobToDataURL(r.thumb),
    })
    onProgress?.(i + 1, records.length)
  }
  const payload: ProjectFile = { format: FORMAT, version: VERSION, project, photos }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

export async function parseProjectFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ project: Project; photos: PhotoRecord[] }> {
  let payload: ProjectFile
  try {
    payload = JSON.parse(await file.text())
  } catch {
    throw new Error('invalid')
  }
  if (
    payload?.format !== FORMAT ||
    typeof payload.version !== 'number' ||
    !Array.isArray(payload.project?.spreads) ||
    !Array.isArray(payload.photos)
  ) {
    throw new Error('invalid')
  }
  const photos: PhotoRecord[] = []
  for (let i = 0; i < payload.photos.length; i++) {
    const p = payload.photos[i]
    photos.push({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      blob: await dataURLToBlob(p.blob),
      thumb: await dataURLToBlob(p.thumb),
    })
    onProgress?.(i + 1, payload.photos.length)
  }
  return { project: payload.project, photos }
}
