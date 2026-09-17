import { co, z } from 'jazz-tools'
import { noteCreatedHere, setSyncStatus } from './status'

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

/**
 * How long a login waits for the server to show us the account's root.
 * It has to clear a peer handshake plus one sync round trip on a slow link
 * (8s was observed to be marginal). It is not stretched further: the
 * timeout ends in a recoverable "Sync error" (reload / sign out of sync),
 * so a longer wait only buys a longer "connecting" spinner on a device
 * that is offline, and a genuinely slow link that needs more than this
 * also gets another full wait on the reload.
 */
const ROOT_WAIT = 15_000

/**
 * Accounts whose root never arrived. Nothing may be decided or written for
 * these: this device has no idea what the account's book is.
 */
const rootMissing = new Set<string>()
export function rootNeverArrived(account: string): boolean {
  return rootMissing.has(account)
}

export const SeqAccount = co
  .account({
    root: SyncRoot,
    profile: co.profile(),
  })
  .withMigration(async (account, creationProps) => {
    if (account.$jazz.has('root')) return
    // creationProps is only passed while the account is being created. Only
    // then may we create the root: creating one on a login because the server
    // was slow would make a second, empty root that wins by last-write-wins
    // and blanks the book on every device.
    if (creationProps) {
      account.$jazz.set('root', { projectJson: '', photos: {} })
      noteCreatedHere(account.$jazz.id)
      return
    }
    await caughtUpWithServer(account.$jazz.raw, ROOT_WAIT)
    if (account.$jazz.has('root')) return

    // The root did not arrive. We must NOT throw: a rejected migration
    // rejects `LocalNode.withLoadedAccount`, and the only thing waiting on it
    // is `contextManager.createContext(props).catch(console.error)` in
    // jazz-tools' react/provider.tsx — nothing calls `updateContext`, so
    // `isReady` stays false forever, the provider renders its fallback, the
    // bridge never mounts, and no status is ever written: the user gets a
    // permanently disabled Sync button, no message and no way out (the
    // half-built LocalNode leaks its peer and storage too, and on the
    // interactive login path the credentials are never stored, so the user is
    // left anonymous with a generic error).
    //
    // So: return normally with no root, and say so out of band. `root` stays
    // undefined, which already makes every effect in useProjectSync inert
    // (and `rootNeverArrived` keeps it from treating the account as loaded
    // at all), SyncProvider keeps the bridge out, and `failed` puts the
    // toolbar in its existing recoverable state (reload / sign out of sync).
    // The rest of the patch matches what the error boundary writes, so a
    // `signedIn` left behind by the bridge that is about to unmount can't
    // outlive it.
    console.error('sync: the account root has not arrived from the server; not syncing on this device')
    rootMissing.add(account.$jazz.id)
    setSyncStatus({ failed: true, active: false, signedIn: false, offline: false })
  })
