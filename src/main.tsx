import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SYNC_ENABLED, SyncProvider } from './sync'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {SYNC_ENABLED ? (
      <Suspense fallback={<div className="loading" />}>
        <SyncProvider>
          <App />
        </SyncProvider>
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
