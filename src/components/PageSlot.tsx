import { useState } from 'react'
import type { DragEvent } from 'react'
import { clearDrag, getDrag, setDrag } from '../dnd'
import { useI18n } from '../i18n'
import type { PhotoMap } from '../photoStore'
import type { Layout, PageState } from '../types'

interface Props {
  spreadId: string
  side: 'left' | 'right'
  page: PageState
  photos: PhotoMap
  onDropPhoto: (spreadId: string, side: 'left' | 'right') => void
  onDropFiles: (spreadId: string, side: 'left' | 'right', files: FileList) => void
  onSetLayout: (spreadId: string, side: 'left' | 'right', layout: Layout) => void
  onClear: (spreadId: string, side: 'left' | 'right') => void
}

export function PageSlot({
  spreadId,
  side,
  page,
  photos,
  onDropPhoto,
  onDropFiles,
  onSetLayout,
  onClear,
}: Props) {
  const { t } = useI18n()
  const [over, setOver] = useState(false)
  const photo = page.photoId ? photos.get(page.photoId) : undefined

  function handleDragOver(e: DragEvent) {
    const drag = getDrag()
    const hasFiles = e.dataTransfer.types.includes('Files')
    if (drag?.type === 'photo' || hasFiles) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver(true)
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    if (e.dataTransfer.files.length > 0) {
      onDropFiles(spreadId, side, e.dataTransfer.files)
      return
    }
    onDropPhoto(spreadId, side)
  }

  function handleDragStart(e: DragEvent) {
    if (!page.photoId) return
    setDrag({ type: 'photo', photoId: page.photoId, from: 'slot', spreadId, side })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', page.photoId)
  }

  return (
    <div
      className={`page-slot ${side} ${over ? 'drag-over' : ''} ${photo ? 'filled' : 'empty'}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      {photo ? (
        <>
          <img
            className={`page-img layout-${page.layout}`}
            src={photo.thumbUrl}
            alt={photo.name}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={clearDrag}
          />
          <div className="slot-controls">
            <button
              title={page.layout === 'full' ? t('toMargin') : t('toFull')}
              onClick={() => onSetLayout(spreadId, side, page.layout === 'full' ? 'margin' : 'full')}
            >
              {page.layout === 'full' ? '▣' : '■'}
            </button>
            <button title={t('backToTray')} onClick={() => onClear(spreadId, side)}>
              ×
            </button>
          </div>
        </>
      ) : (
        <span className="slot-hint">{side === 'left' ? t('verso') : t('recto')}</span>
      )}
    </div>
  )
}
