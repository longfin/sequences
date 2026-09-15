import { JazzReactProvider } from 'jazz-tools/react'
import type { ReactNode } from 'react'
import { SeqAccount } from './schema'

const API_KEY: string = import.meta.env.VITE_JAZZ_API_KEY ?? ''

export function SyncProvider({ children }: { children: ReactNode }) {
  return (
    <JazzReactProvider
      AccountSchema={SeqAccount}
      // Nothing leaves the device until the user explicitly signs in.
      sync={{ peer: `wss://cloud.jazz.tools/?key=${API_KEY}`, when: 'signedUp' }}
      defaultProfileName="Sequences"
    >
      {children}
    </JazzReactProvider>
  )
}
