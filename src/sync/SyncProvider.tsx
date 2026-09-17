import { cojsonInternals } from 'jazz-tools'
import { JazzReactProvider } from 'jazz-tools/react'
import type { ReactNode } from 'react'
import { SeqAccount } from './schema'
import { useSyncStatus } from './status'

// A thumbnail created on another device a moment ago may reach the server a
// beat after the record entry that points at it. Ask the server a few more
// times before declaring it unavailable (default: 1 retry after 3s).
cojsonInternals.setCoValueLoadingMaxRetries(6)
cojsonInternals.setCoValueLoadingRetryDelay(1_000)

const API_KEY: string = import.meta.env.VITE_JAZZ_API_KEY ?? ''
// tests point this at a local `jazz-run sync` server instead of Jazz Cloud
const PEER: string = import.meta.env.VITE_JAZZ_SYNC_PEER || `wss://cloud.jazz.tools/?key=${API_KEY}`

export function SyncProvider({ children }: { children: ReactNode }) {
  // `failed` is normally set by the error boundary, which renders nothing at
  // all — this provider is gone by then. It is also set by the account
  // migration when the root never arrived from the server, and there the
  // provider *does* become ready: keep the bridge out in that case too, so
  // the toolbar shows App's failed state (reload / sign out of sync) on its
  // own rather than next to a Sync menu that cannot work.
  const { failed } = useSyncStatus()
  return (
    <JazzReactProvider
      AccountSchema={SeqAccount}
      // Nothing leaves the device until the user explicitly signs in.
      sync={{ peer: PEER as `wss://${string}` | `ws://${string}`, when: 'signedUp' }}
      defaultProfileName="Sequences"
    >
      {failed ? null : children}
    </JazzReactProvider>
  )
}
