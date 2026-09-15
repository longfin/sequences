import { cojsonInternals } from 'jazz-tools'
import { JazzReactProvider } from 'jazz-tools/react'
import type { ReactNode } from 'react'
import { SeqAccount } from './schema'

// A thumbnail created on another device a moment ago may reach the server a
// beat after the record entry that points at it. Ask the server a few more
// times before declaring it unavailable (default: 1 retry after 3s).
cojsonInternals.setCoValueLoadingMaxRetries(6)
cojsonInternals.setCoValueLoadingRetryDelay(1_000)

const API_KEY: string = import.meta.env.VITE_JAZZ_API_KEY ?? ''
// tests point this at a local `jazz-run sync` server instead of Jazz Cloud
const PEER: string = import.meta.env.VITE_JAZZ_SYNC_PEER || `wss://cloud.jazz.tools/?key=${API_KEY}`

export function SyncProvider({ children }: { children: ReactNode }) {
  return (
    <JazzReactProvider
      AccountSchema={SeqAccount}
      // Nothing leaves the device until the user explicitly signs in.
      sync={{ peer: PEER as `wss://${string}` | `ws://${string}`, when: 'signedUp' }}
      defaultProfileName="Sequences"
    >
      {children}
    </JazzReactProvider>
  )
}
