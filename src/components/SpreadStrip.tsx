import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { clearDrag, getDrag, setDrag } from '../dnd'
import { useI18n } from '../i18n'
import type { PhotoMap } from '../photoStore'
import type { Layout, Spread } from '../types'
import { PageSlot } from './PageSlot'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_KEY = 'sequences-zoom'

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

interface Props {
  spreads: Spread[]
  photos: PhotoMap
  pageRatio: number
  onDropPhoto: (spreadId: string, side: 'left' | 'right') => void
  onDropFiles: (spreadId: string, side: 'left' | 'right', files: FileList) => void
  onSetLayout: (spreadId: string, side: 'left' | 'right', layout: Layout) => void
  onClear: (spreadId: string, side: 'left' | 'right') => void
  onAddSpread: () => void
  onRemoveSpread: (id: string) => void
  onMoveSpread: (dragId: string, targetIndex: number) => void
}

export function SpreadStrip(props: Props) {
  const { spreads } = props
  const { t } = useI18n()
  const stripRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(() => {
    const z = parseFloat(localStorage.getItem(ZOOM_KEY) ?? '1')
    return Number.isFinite(z) ? clampZoom(z) : 1
  })

  useEffect(() => {
    localStorage.setItem(ZOOM_KEY, String(zoom))
  }, [zoom])

  // ctrl/cmd + wheel zooms the strip (needs a non-passive listener)
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="strip-wrap">
      <div
        className="spread-strip"
        ref={stripRef}
        style={{ '--card-w': `${Math.round(640 * zoom)}px` } as React.CSSProperties}
      >
        {spreads.map((spread, i) => (
          <SpreadCard key={spread.id} spread={spread} index={i} {...props} />
        ))}
        <button className="add-spread" onClick={props.onAddSpread} title={t('addSpread')}>
          +
        </button>
      </div>
      <div className="zoom-control">
        <button
          title={t('zoomOut')}
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom((z) => clampZoom(z - 0.1))}
        >
          −
        </button>
        <button className="zoom-value" title={t('zoomReset')} onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          title={t('zoomIn')}
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom((z) => clampZoom(z + 0.1))}
        >
          +
        </button>
      </div>
    </div>
  )
}

function SpreadCard({
  spread,
  index,
  photos,
  pageRatio,
  onDropPhoto,
  onDropFiles,
  onSetLayout,
  onClear,
  onRemoveSpread,
  onMoveSpread,
}: Props & { spread: Spread; index: number }) {
  const { t } = useI18n()
  const [over, setOver] = useState(false)
  const isEmpty = !spread.left.photoId && !spread.right.photoId

  function handleHandleDragStart(e: DragEvent) {
    setDrag({ type: 'spread', spreadId: spread.id })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', spread.id)
  }

  function handleDragOver(e: DragEvent) {
    const drag = getDrag()
    if (drag?.type === 'spread' && drag.spreadId !== spread.id) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver(true)
    }
  }

  function handleDrop(e: DragEvent) {
    const drag = getDrag()
    if (drag?.type === 'spread') {
      e.preventDefault()
      setOver(false)
      onMoveSpread(drag.spreadId, index)
    }
  }

  return (
    <div
      className={`spread-card ${over ? 'reorder-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <div className="spread-header">
        <span
          className="spread-handle"
          draggable
          onDragStart={handleHandleDragStart}
          onDragEnd={clearDrag}
          title={t('reorderSpread')}
        >
          ⠿ p{index * 2 + 2}–{index * 2 + 3}
        </span>
        <button
          className="spread-remove"
          title={isEmpty ? t('removeSpread') : t('removeSpreadFull')}
          onClick={() => onRemoveSpread(spread.id)}
        >
          ×
        </button>
      </div>
      <div className="spread-pages" style={{ aspectRatio: `${pageRatio * 2}` }}>
        <PageSlot
          spreadId={spread.id}
          side="left"
          page={spread.left}
          photos={photos}
          onDropPhoto={onDropPhoto}
          onDropFiles={onDropFiles}
          onSetLayout={onSetLayout}
          onClear={onClear}
        />
        <div className="gutter" />
        <PageSlot
          spreadId={spread.id}
          side="right"
          page={spread.right}
          photos={photos}
          onDropPhoto={onDropPhoto}
          onDropFiles={onDropFiles}
          onSetLayout={onSetLayout}
          onClear={onClear}
        />
      </div>
    </div>
  )
}
