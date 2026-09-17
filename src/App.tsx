import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { FlipPreview } from './components/FlipPreview'
import { Overview } from './components/Overview'
import { SpreadStrip } from './components/SpreadStrip'
import { Tray } from './components/Tray'
import * as db from './db'
import { getDrag } from './dnd'
import {
  I18nContext,
  LOCALES,
  detectLocale,
  persistLocale,
  translate,
  type Locale,
  type MsgKey,
} from './i18n'
import { importFile, isImageFile } from './images'
import { exportPdf } from './pdf'
import { buildProjectFile, parseProjectFile } from './projectFile'
import type { PhotoMap, PhotoView } from './photoStore'
import {
  JAZZ_SECRET_KEY,
  SYNC_ENABLED,
  SyncBridge,
  SyncErrorBoundary,
  SyncProvider,
  SyncSignOutDialog,
  clearSyncBase,
  deriveRecoveryPhrase,
  hasStoredSignIn,
  onSyncEvent,
  postSyncEvent,
  readStoredCredentials,
  useSyncStatus,
  type ProjectSync,
  type SignOutPrompt,
} from './sync'
import {
  PAGE_RATIOS,
  defaultProject,
  newSpread,
  placedPhotoIds,
  type Layout,
  type PhotoRecord,
  type Project,
  type Spread,
} from './types'

type View = 'edit' | 'overview' | 'preview'

type ParsedFile = Awaited<ReturnType<typeof parseProjectFile>>

/** a this-device operation held back until the account has been left */
type PendingOp = { kind: 'reset' } | { kind: 'load'; parsed: ParsedFile }

export default function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [photos, setPhotos] = useState<PhotoMap>(new Map())
  const [view, setView] = useState<View>('edit')
  const [previewStart, setPreviewStart] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const projectFileInput = useRef<HTMLInputElement>(null)
  const syncRef = useRef<ProjectSync | null>(null)
  const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null)
  const [signOut, setSignOut] = useState<SignOutPrompt | null>(null)
  const pendingOp = useRef<PendingOp | null>(null)
  const sync = useSyncStatus()
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const t = useCallback(
    (key: MsgKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  const setLocale = useCallback((l: Locale) => {
    persistLocale(l)
    setLocaleState(l)
  }, [])

  useEffect(() => {
    document.title = translate(locale, 'appTitle')
  }, [locale])

  // initial load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [savedProject, savedPhotos] = await Promise.all([db.loadProject(), db.loadPhotos()])
      if (cancelled) return
      const map: PhotoMap = new Map()
      for (const rec of savedPhotos) {
        map.set(rec.id, {
          id: rec.id,
          name: rec.name,
          width: rec.width,
          height: rec.height,
          thumbUrl: URL.createObjectURL(rec.thumb),
        })
      }
      setPhotos(map)
      setProject(savedProject ?? defaultProject())
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // debounced persistence
  const saveTimer = useRef<number>()
  useEffect(() => {
    if (!project) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      db.saveProject(project)
    }, 300)
  }, [project])

  const update = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => (p ? fn(p) : p))
  }, [])

  // ---- photo import / delete ----

  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(isImageFile)
    if (list.length === 0) return
    setBusy(t('importing', { done: 0, total: list.length }))
    const imported: PhotoView[] = []
    for (let i = 0; i < list.length; i++) {
      try {
        const rec = await importFile(list[i])
        await db.savePhoto(rec)
        imported.push({
          id: rec.id,
          name: rec.name,
          width: rec.width,
          height: rec.height,
          thumbUrl: URL.createObjectURL(rec.thumb),
        })
      } catch (err) {
        console.error('import 실패:', list[i].name, err)
      }
      setBusy(t('importing', { done: i + 1, total: list.length }))
    }
    setPhotos((prev) => {
      const next = new Map(prev)
      for (const p of imported) next.set(p.id, p)
      return next
    })
    setBusy(null)
    return imported
  }

  async function handleDeletePhoto(id: string) {
    // local record first, then the tombstone: another tab on this origin
    // decides what to keep by reading IndexedDB when the tombstone arrives
    await db.deletePhoto(id)
    // other devices drop their thumbnail copy; a held original there is only unplaced
    syncRef.current?.removePhoto(id)
    setPhotos((prev) => {
      const victim = prev.get(id)
      if (victim) URL.revokeObjectURL(victim.thumbUrl)
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    update((p) => ({
      ...p,
      spreads: p.spreads.map((s) => ({
        ...s,
        left: s.left.photoId === id ? { ...s.left, photoId: null } : s.left,
        right: s.right.photoId === id ? { ...s.right, photoId: null } : s.right,
      })),
    }))
  }

  // ---- slot operations ----

  function setSlotPhoto(spreads: Spread[], spreadId: string, side: 'left' | 'right', photoId: string | null): Spread[] {
    return spreads.map((s) =>
      s.id === spreadId ? { ...s, [side]: { ...s[side], photoId } } : s,
    )
  }

  function handleDropPhoto(spreadId: string, side: 'left' | 'right') {
    const drag = getDrag()
    if (drag?.type !== 'photo') return
    update((p) => {
      let spreads = p.spreads
      const target = spreads.find((s) => s.id === spreadId)
      if (!target) return p
      const displaced = target[side].photoId

      if (drag.from === 'slot') {
        if (drag.spreadId === spreadId && drag.side === side) return p
        // swap: displaced photo goes back to the source slot
        spreads = setSlotPhoto(spreads, drag.spreadId, drag.side, displaced)
      }
      spreads = setSlotPhoto(spreads, spreadId, side, drag.photoId)
      return { ...p, spreads }
    })
  }

  async function handleDropFiles(spreadId: string, side: 'left' | 'right', files: FileList) {
    const imported = await importFiles(files)
    if (imported && imported.length > 0) {
      update((p) => ({ ...p, spreads: setSlotPhoto(p.spreads, spreadId, side, imported[0].id) }))
    }
  }

  function handleSetLayout(spreadId: string, side: 'left' | 'right', layout: Layout) {
    update((p) => ({
      ...p,
      spreads: p.spreads.map((s) =>
        s.id === spreadId ? { ...s, [side]: { ...s[side], layout } } : s,
      ),
    }))
  }

  function handleClearSlot(spreadId: string, side: 'left' | 'right') {
    update((p) => ({ ...p, spreads: setSlotPhoto(p.spreads, spreadId, side, null) }))
  }

  function handleUnassignFromSlot() {
    const drag = getDrag()
    if (drag?.type === 'photo' && drag.from === 'slot') {
      handleClearSlot(drag.spreadId, drag.side)
    }
  }

  // ---- spread operations ----

  function handleAddSpread() {
    update((p) => ({ ...p, spreads: [...p.spreads, newSpread()] }))
  }

  function handleRemoveSpread(id: string) {
    update((p) => ({ ...p, spreads: p.spreads.filter((s) => s.id !== id) }))
  }

  function handleMoveSpread(dragId: string, targetIndex: number) {
    update((p) => {
      const from = p.spreads.findIndex((s) => s.id === dragId)
      if (from < 0 || from === targetIndex) return p
      const spreads = [...p.spreads]
      const [moved] = spreads.splice(from, 1)
      spreads.splice(targetIndex, 0, moved)
      return { ...p, spreads }
    })
  }

  // ---- preview ----

  function openPreview() {
    // start from the spread closest to the center of the edit strip viewport
    let start = 0
    const strip = document.querySelector('.spread-strip')
    if (strip) {
      const rect = strip.getBoundingClientRect()
      const center = rect.top + rect.height / 2
      let best = Infinity
      strip.querySelectorAll('.spread-card').forEach((card, i) => {
        const r = card.getBoundingClientRect()
        const d = Math.abs(r.top + r.height / 2 - center)
        if (d < best) {
          best = d
          start = i
        }
      })
    }
    setPreviewStart(start)
    setView('preview')
  }

  function closePreview(finalIndex: number) {
    setView('edit')
    // after the edit strip renders, bring the last-viewed spread into view
    window.setTimeout(() => {
      const cards = document.querySelectorAll('.spread-strip .spread-card')
      cards[finalIndex]?.scrollIntoView({ block: 'center' })
    }, 0)
  }

  // ---- file menu: save / load / reset ----

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  function replacePhotoViews(records: { id: string; name: string; width: number; height: number; thumb: Blob }[]) {
    setPhotos((prev) => {
      for (const p of prev.values()) URL.revokeObjectURL(p.thumbUrl)
      const next: PhotoMap = new Map()
      for (const r of records) {
        next.set(r.id, {
          id: r.id,
          name: r.name,
          width: r.width,
          height: r.height,
          thumbUrl: URL.createObjectURL(r.thumb),
        })
      }
      return next
    })
  }

  async function handleSaveProject() {
    if (!project) return
    setBusy(t('savingFile', { done: 0, total: photos.size }))
    try {
      const records = await db.loadPhotos()
      const blob = await buildProjectFile(project, records, (done, total) =>
        setBusy(t('savingFile', { done, total })),
      )
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sequences-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBusy(null)
    }
  }

  async function handleLoadProject(file: File) {
    if (!window.confirm(t(syncingNow() ? 'loadConfirmSync' : 'loadConfirm'))) return
    let parsed: ParsedFile
    setBusy(t('loadingFile', { done: 0, total: '?' }))
    try {
      parsed = await parseProjectFile(file, (done, total) =>
        setBusy(t('loadingFile', { done, total })),
      )
    } catch (err) {
      console.error(err)
      alert(t('invalidFile'))
      return
    } finally {
      setBusy(null)
    }
    // Loading is a this-device operation. Leave the account (and wait for it)
    // rather than pushing a wholesale replacement to every other device.
    if ((await prepareThisDeviceOp({ kind: 'load', parsed })) !== 'go') return
    await applyLoadedProject(parsed)
  }

  async function applyLoadedProject(parsed: ParsedFile) {
    setBusy(t('loadingFile', { done: parsed.photos.length, total: parsed.photos.length }))
    try {
      // A save made on a thumbnail-only device must not replace originals we hold.
      const existing = new Map<string, PhotoRecord>()
      for (const rec of await db.loadPhotos()) {
        if (rec.hasOriginal !== false) existing.set(rec.id, rec)
      }
      const photos = parsed.photos.map((rec) => (!rec.hasOriginal && existing.get(rec.id)) || rec)
      await db.clearAll()
      for (const rec of photos) await db.savePhoto(rec)
      // written straight away, not through the 300ms debounce: this path can
      // be followed by an immediate reload
      await db.saveProject(parsed.project)
      replacePhotoViews(photos)
      setProject(parsed.project)
      postSyncEvent('reload')
    } catch (err) {
      console.error(err)
      alert(t('invalidFile'))
    } finally {
      setBusy(null)
    }
  }

  async function runReset() {
    const fresh = defaultProject()
    await db.clearAll()
    await db.saveProject(fresh)
    replacePhotoViews([])
    setProject(fresh)
    postSyncEvent('reload')
  }

  /**
   * Signed in — even if the root hasn't loaded yet, and even if the lazy Jazz
   * chunk hasn't mounted at all. The stored credentials are the only evidence
   * available in that last window, and without them a Reset or Load started
   * there would skip the log-out and be pushed over the cloud copy the moment
   * the bridge arrives.
   */
  function syncingNow(): boolean {
    return sync.signedIn || Boolean(syncRef.current?.active) || (SYNC_ENABLED && hasStoredSignIn())
  }

  /**
   * A this-device operation (Reset / Load) must leave the account first.
   *
   * - 'go'     — nothing to leave, or we just left: run the operation now.
   * - 'stop'   — refused; the user has been told why.
   * - 'dialog' — sync has crashed and can't log out normally, so the sign-out
   *   dialog is open; `pendingOp` resumes the operation if the user confirms.
   */
  async function prepareThisDeviceOp(op: PendingOp): Promise<'go' | 'stop' | 'dialog'> {
    if (!syncingNow()) return 'go'
    if (syncRef.current) return (await leaveSync()) ? 'go' : 'stop'
    if (sync.failed) {
      // The bridge is gone for good (stale chunk after a deploy, offline first
      // visit). Reloading can't help, so the way through is to drop the account
      // on this device — after showing the phrase — and then carry on.
      const prompt = await openSignOutPrompt('continue')
      if (!prompt) return 'go'
      if (prompt.kind === 'blocked') return 'stop'
      pendingOp.current = op
      return 'dialog'
    }
    console.error('sync: signed in but the bridge is not ready; refusing a this-device operation')
    alert(t('syncNotReady'))
    return 'stop'
  }

  /** log out of sync before a this-device operation; false if we are still signed in */
  async function leaveSync(): Promise<boolean> {
    try {
      await syncRef.current!.logOut()
      // the next login must not mistake this device's fresh state for "unchanged"
      clearSyncBase()
      // other tabs share the session and the store: they must stop syncing too
      postSyncEvent('logout')
      return true
    } catch (err) {
      console.error(err)
      alert(t('syncError'))
      return false
    }
  }

  // a this-device operation in another tab replaced the local store: pick it up
  useEffect(
    () =>
      onSyncEvent((type) => {
        if (type === 'reload') location.reload()
      }),
    [],
  )

  /**
   * Open the "the account is about to leave this device" question. Returns the
   * prompt that was opened, or null when there is no signed-in account to lose
   * (an anonymous account is never worth a warning: nothing was ever uploaded).
   */
  async function openSignOutPrompt(
    purpose: 'sign-out' | 'continue',
  ): Promise<SignOutPrompt | null> {
    if (!hasStoredSignIn()) return null
    const credentials = readStoredCredentials()
    if (!credentials) return null
    let prompt: SignOutPrompt
    if (!credentials.secretSeed) {
      // no seed on this device (the account may still be reachable by passkey)
      prompt = { kind: 'ask', phrase: null, purpose }
    } else {
      try {
        prompt = { kind: 'ask', phrase: await deriveRecoveryPhrase(credentials.secretSeed), purpose }
      } catch (err) {
        // A seed is there but we can't turn it into words. Deleting the secret
        // now would strand the account with nothing written down: refuse.
        console.error('sync: could not derive the recovery phrase; keeping the account secret', err)
        prompt = { kind: 'blocked' }
      }
    }
    setSignOut(prompt)
    return prompt
  }

  /**
   * The Jazz subtree crashed and the user chose to leave the account on this
   * device. Show the recovery phrase first: without it (or a passkey) the
   * account is unreachable afterwards.
   */
  async function handleSyncFailedLogOut() {
    pendingOp.current = null
    // never warn about losing an account the user never signed in to
    if (!(await openSignOutPrompt('sign-out'))) forgetSyncAccount()
  }

  /** drop the account secret and the merge bases on this device */
  function dropSyncAccount() {
    try {
      localStorage.removeItem(JAZZ_SECRET_KEY)
    } catch (err) {
      console.error(err)
    }
    clearSyncBase()
    postSyncEvent('logout')
  }

  /** leave the account on this device, then restart */
  function forgetSyncAccount() {
    setSignOut(null)
    pendingOp.current = null
    dropSyncAccount()
    location.reload()
  }

  /**
   * The user confirmed the sign-out dialog. With no pending operation this is
   * the plain "leave the account here" case; otherwise sync had crashed and
   * the Reset / Load that was waiting on the log-out now runs, followed by a
   * reload (the Jazz chunk is dead, so the page has to restart anyway).
   */
  async function confirmSignOut() {
    const op = pendingOp.current
    pendingOp.current = null
    setSignOut(null)
    if (!op) {
      forgetSyncAccount()
      return
    }
    dropSyncAccount()
    try {
      if (op.kind === 'reset') await runReset()
      else await applyLoadedProject(op.parsed)
    } catch (err) {
      console.error(err)
    }
    location.reload()
  }

  async function handleReset() {
    if (!window.confirm(t(syncingNow() ? 'resetConfirmSync' : 'resetConfirm'))) return
    // Reset is a this-device operation; the cloud copy is left untouched.
    // Wait for the logout so the bridge can't pull the cloud copy back in.
    if ((await prepareThisDeviceOp({ kind: 'reset' })) !== 'go') return
    await runReset()
  }

  // ---- export ----

  async function handleExportPdf() {
    if (!project) return
    const records = await Promise.all(placedPhotoIds(project).map((id) => db.getPhoto(id)))
    if (records.some((r) => r && r.hasOriginal === false) && !window.confirm(t('pdfLowResConfirm'))) {
      return
    }
    setBusy(t('exportingPdfStart'))
    try {
      await exportPdf(project, (done, total) => setBusy(t('exportingPdf', { done, total })))
    } catch (err) {
      console.error(err)
      alert(t('pdfFailed'))
    } finally {
      setBusy(null)
    }
  }

  if (!project) return <div className="loading">{t('loading')}</div>

  const assignedIds = new Set(
    project.spreads.flatMap((s) => [s.left.photoId, s.right.photoId]).filter(Boolean) as string[],
  )
  const trayPhotos = [...photos.values()].filter((p) => !assignedIds.has(p.id))
  // `incompatible` is not work in progress but a paused state: the cloud book
  // was written by a newer build, so it reads as a short static line.
  const syncBusy = sync.incompatible
    ? t('syncIncompatible')
    : sync.toUpload + sync.toDownload > 0
      ? t('syncBusy', { up: sync.toUpload, down: sync.toDownload })
      : null
  const busyPaused = !busy && sync.incompatible
  const remoteDeleted = new Set(sync.remoteDeleted)

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
    {SYNC_ENABLED && (
      <SyncErrorBoundary>
        <Suspense fallback={null}>
          <SyncProvider>
            <SyncBridge
              project={project}
              setProject={setProject}
              updateProject={update}
              photos={photos}
              setPhotos={setPhotos}
              apiRef={syncRef}
              menuSlot={menuSlot}
            />
          </SyncProvider>
        </Suspense>
      </SyncErrorBoundary>
    )}
    <div className={`app ${project.grayscale ? 'grayscale' : ''}`}>
      <header className="toolbar">
        <h1 className="brand">Sequences</h1>
        <select
          value={project.pageRatio}
          onChange={(e) => update((p) => ({ ...p, pageRatio: Number(e.target.value) }))}
          title={t('pageRatioTitle')}
        >
          {PAGE_RATIOS.map((r) => (
            <option key={r.labelKey} value={r.value}>
              {t(r.labelKey)}
            </option>
          ))}
        </select>
        <select
          className="locale-select"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          title={t('languageTitle')}
        >
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <div className="menu-wrap">
          <button
            className={menuOpen ? 'active' : ''}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((o) => !o)
            }}
          >
            {t('file')} ▾
          </button>
          {menuOpen && (
            <div className="menu" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  handleSaveProject()
                }}
              >
                {t('saveProject')}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  projectFileInput.current?.click()
                }}
              >
                {t('loadProject')}
              </button>
              <div className="menu-sep" />
              <button
                className="danger"
                onClick={() => {
                  setMenuOpen(false)
                  handleReset()
                }}
              >
                {t('reset')}
              </button>
            </div>
          )}
          <input
            ref={projectFileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleLoadProject(f)
              e.target.value = ''
            }}
          />
        </div>
        {SYNC_ENABLED && (
          <div className="menu-wrap" ref={setMenuSlot}>
            {sync.failed ? (
              // a stale chunk after a deploy is the usual cause: reload first,
              // leaving the account is the explicit second choice
              <div className="sync-failed">
                <button
                  className="danger-outline"
                  onClick={() => location.reload()}
                  title={t('syncFailedReloadTitle')}
                >
                  {t('syncFailedReload')}
                </button>
                <button onClick={handleSyncFailedLogOut} title={t('syncFailedSignOutTitle')}>
                  {t('syncFailedSignOut')}
                </button>
              </div>
            ) : (
              !sync.loaded && <button disabled>{t('sync')}</button>
            )}
          </div>
        )}
        <div className="toolbar-spacer" />
        {(busy || syncBusy) && (
          <span
            className={`busy ${busyPaused ? 'paused' : ''}`}
            title={busyPaused ? t('syncIncompatibleTitle') : undefined}
          >
            <span className="busy-dot" />
            <span className="busy-label">{busy ?? syncBusy}</span>
          </span>
        )}
        <div className="seg" role="group" aria-label={t('viewSwitch')}>
          <button className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}>
            {t('edit')}
          </button>
          <button className={view === 'overview' ? 'on' : ''} onClick={() => setView('overview')}>
            {t('overview')}
          </button>
        </div>
        <button
          className={project.grayscale ? 'active' : ''}
          onClick={() => update((p) => ({ ...p, grayscale: !p.grayscale }))}
          title={t('grayscaleTitle')}
        >
          {t('grayscale')}
        </button>
        <button onClick={openPreview}>{t('flipThrough')}</button>
        <button className="primary" onClick={handleExportPdf} disabled={busy !== null}>
          PDF
        </button>
      </header>

      {view === 'overview' ? (
        <Overview
          spreads={project.spreads}
          photos={photos}
          pageRatio={project.pageRatio}
          onSelectSpread={(i) => {
            setPreviewStart(i)
            setView('preview')
          }}
        />
      ) : (
        <SpreadStrip
          spreads={project.spreads}
          photos={photos}
          pageRatio={project.pageRatio}
          onDropPhoto={handleDropPhoto}
          onDropFiles={handleDropFiles}
          onSetLayout={handleSetLayout}
          onClear={handleClearSlot}
          onAddSpread={handleAddSpread}
          onRemoveSpread={handleRemoveSpread}
          onMoveSpread={handleMoveSpread}
        />
      )}

      <Tray
        photos={trayPhotos}
        remoteDeleted={remoteDeleted}
        onImportFiles={importFiles}
        onDropFromSlot={handleUnassignFromSlot}
        onDeletePhoto={handleDeletePhoto}
      />

      {view === 'preview' && (
        <FlipPreview
          spreads={project.spreads}
          photos={photos}
          pageRatio={project.pageRatio}
          startIndex={previewStart}
          onExit={closePreview}
        />
      )}
    </div>
    {signOut && (
      <SyncSignOutDialog
        prompt={signOut}
        onConfirm={confirmSignOut}
        onCancel={() => {
          // nothing has changed: the pending Reset / Load is dropped too
          pendingOp.current = null
          setSignOut(null)
        }}
      />
    )}
    </I18nContext.Provider>
  )
}
