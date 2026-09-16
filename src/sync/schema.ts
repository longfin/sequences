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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Wait until this device has received everything the sync server holds
 * for a CoValue (or until there is no server, or the timeout passes).
 *
 * Jazz runs the account migration as soon as the account CoValue is
 * available locally, which on a fresh login can be before the transaction
 * that set `root` has arrived. Deciding "no root" then would create a second,
 * empty root and, by last-write-wins, replace the real book for every device.
 */
async function caughtUpWithServer(raw: unknown, timeoutMs: number): Promise<void> {
  type KnownState = { sessions?: Record<string, number> }
  type Peer = { closed: boolean; getKnownState?: (id: string) => KnownState | undefined }
  const r = raw as {
    id: string
    core?: { knownState?: () => KnownState; node?: { syncManager?: { getServerPeers?: (id: string) => Peer[] } } }
  }
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    // the server peer may not be attached yet right after login: keep waiting
    const peers = r.core?.node?.syncManager?.getServerPeers?.(r.id) ?? []
    const informed = peers.find((p) => !p.closed && p.getKnownState?.(r.id) != null)
    if (informed) {
      const server = informed.getKnownState!(r.id)?.sessions ?? {}
      const local = r.core?.knownState?.()?.sessions ?? {}
      const behind = Object.entries(server).some(([session, count]) => (local[session] ?? 0) < count)
      if (!behind) return
    }
    await sleep(100)
  }
}

/** accounts whose root this device created: their blank root is genuinely blank */
export const createdHere = new Set<string>()

export const SeqAccount = co
  .account({
    root: SyncRoot,
    profile: co.profile(),
  })
  .withMigration(async (account, creationProps) => {
    if (account.$jazz.has('root')) return
    // creationProps is only passed while the account is being created; on a
    // login the root exists somewhere and we must not decide before the
    // server has shown us the account's content
    if (!creationProps) await caughtUpWithServer(account.$jazz.raw, 8_000)
    if (!account.$jazz.has('root')) {
      account.$jazz.set('root', { projectJson: '', photos: {} })
      createdHere.add(account.$jazz.id)
    }
  })
