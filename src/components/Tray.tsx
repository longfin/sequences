import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { clearDrag, getDrag, setDrag } from '../dnd'
import { useI18n } from '../i18n'
import type { PhotoView } from '../photoStore'

interface Props {
  photos: PhotoView[]
  onImportFiles: (files: FileList | File[]) => void
  onDropFromSlot: () => void
  onDeletePhoto: (id: string) => void
}

export function Tray({ photos, onImportFiles, onDropFromSlot, onDeletePhoto }: Props) {
  const { t } = useI18n()
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function handleDragOver(e: DragEvent) {
    const drag = getDrag()
    const hasFiles = e.dataTransfer.types.includes('Files')
    if (hasFiles || (drag?.type === 'photo' && drag.from === 'slot')) {
      e.preventDefault()
      setOver(true)
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    if (e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files)
      return
    }
    const drag = getDrag()
    if (drag?.type === 'photo' && drag.from === 'slot') {
      onDropFromSlot()
    }
  }

  return (
    <div
      className={`tray ${over ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <div className="tray-header">
        <span className="tray-label">
          {t('trayLabel')} <em>{photos.length}</em>
        </span>
        <button onClick={() => fileInput.current?.click()}>{t('addPhotos')}</button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onImportFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      <div className="tray-photos">
        {photos.length === 0 && <p className="tray-empty">{t('trayEmpty')}</p>}
        {photos.map((p) => (
          <div key={p.id} className="tray-photo">
            <img
              src={p.thumbUrl}
              alt={p.name}
              title={p.name}
              draggable
              onDragStart={(e) => {
                setDrag({ type: 'photo', photoId: p.id, from: 'tray' })
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', p.id)
              }}
              onDragEnd={clearDrag}
            />
            <button className="tray-delete" title={t('deletePhoto')} onClick={() => onDeletePhoto(p.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
