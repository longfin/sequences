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

// Writes resolve on transaction completion (not just request success) so
// that another tab reading right after sees the committed state.

export async function savePhoto(photo: PhotoRecord): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('photos', 'readwrite')
  await tx.store.put(photo)
  await tx.done
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('photos', 'readwrite')
  await tx.store.delete(id)
  await tx.done
}

export async function clearAll(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['photos', 'project'], 'readwrite')
  await Promise.all([tx.objectStore('photos').clear(), tx.objectStore('project').clear()])
  await tx.done
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDB()
  return db.get('photos', id)
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB()
  const rec: PhotoRecord | undefined = await db.get('photos', id)
  return rec?.blob
}
