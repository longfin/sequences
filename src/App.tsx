import { useCallback, useEffect, useRef, useState } from 'react'
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
  PAGE_RATIOS,
  defaultProject,
  newSpread,
  type Layout,
  type Project,
  type Spread,
} from './types'

type View = 'edit' | 'overview' | 'preview'

export default function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [photos, setPhotos] = useState<PhotoMap>(new Map())
  const [view, setView] = useState<View>('edit')
  const [previewStart, setPreviewStart] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const projectFileInput = useRef<HTMLInputElement>(null)
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
    await db.deletePhoto(id)
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
    if (!window.confirm(t('loadConfirm'))) return
    setBusy(t('loadingFile', { done: 0, total: '?' }))
    try {
      const parsed = await parseProjectFile(file, (done, total) =>
        setBusy(t('loadingFile', { done, total })),
      )
      await db.clearAll()
      for (const rec of parsed.photos) await db.savePhoto(rec)
      replacePhotoViews(parsed.photos)
      setProject(parsed.project)
    } catch (err) {
      console.error(err)
      alert(t('invalidFile'))
    } finally {
      setBusy(null)
    }
  }

  async function handleReset() {
    if (!window.confirm(t('resetConfirm'))) return
    await db.clearAll()
    replacePhotoViews([])
    setProject(defaultProject())
  }

  // ---- export ----

  async function handleExportPdf() {
    if (!project) return
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

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
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
        <div className="toolbar-spacer" />
        {busy && (
          <span className="busy">
            <span className="busy-dot" />
            {busy}
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
    </I18nContext.Provider>
  )
}
