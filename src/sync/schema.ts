import { co, z } from 'jazz-tools'

/**
 * Jazz schema for cross-device sync.
 *
 * Only what the UI needs to *view* a book travels through Jazz: the project
 * document (spreads / ratio / grayscale) and the ≤600px thumbnails. Originals
 * stay in the local IndexedDB of the device that imported them.
 *
 * The project is stored as one JSON string and merged last-write-wins. The
 * document is small and single-user, so per-field CRDT merging isn't worth
 * the complexity yet.
 *
 * A thumbnail travels inline (`thumbData`, base64 JPEG) inside its record
 * entry, so an entry that has loaded is complete: there is no second
 * CoValue to fetch, and no window in which another device sees the entry
 * before the bytes have reached the server. (`thumb` is the earlier
 * FileStream form; still readable, no longer written.)
 *
 * Photos are never removed from the record. A delete sets `deleted: true`
 * (a tombstone) so a device that was offline when the delete happened
 * doesn't re-upload its copy and resurrect the photo.
 */
export const SyncPhoto = co.map({
  name: z.string(),
  width: z.number(),
  height: z.number(),
  thumbData: z.optional(z.string()),
  thumb: co.optional(co.fileStream()),
  deleted: z.optional(z.boolean()),
})

export const SyncPhotos = co.record(z.string(), SyncPhoto)

export const SyncRoot = co.map({
  projectJson: z.string(),
  photos: SyncPhotos,
})

export const SeqAccount = co
  .account({
    root: SyncRoot,
    profile: co.profile(),
  })
  .withMigration((account) => {
    if (!account.$jazz.has('root')) {
      account.$jazz.set('root', { projectJson: '', photos: {} })
    }
  })
