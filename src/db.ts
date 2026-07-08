import { openDB, type IDBPDatabase } from 'idb'
import type { PhotoRecord, Project } from './types'

const DB_NAME = 'sequences'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('photos', { keyPath: 'id' })
        db.createObjectStore('project')
      },
    })
  }
  return dbPromise
}

export async function loadProject(): Promise<Project | undefined> {
  const db = await getDB()
  return db.get('project', 'current')
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB()
  await db.put('project', project, 'current')
}

export async function loadPhotos(): Promise<PhotoRecord[]> {
  const db = await getDB()
  return db.getAll('photos')
}

export async function savePhoto(photo: PhotoRecord): Promise<void> {
  const db = await getDB()
  await db.put('photos', photo)
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('photos', id)
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB()
  const rec: PhotoRecord | undefined = await db.get('photos', id)
  return rec?.blob
}
