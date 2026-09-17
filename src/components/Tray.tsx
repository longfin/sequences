import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { clearDrag, getDrag, setDrag } from '../dnd'
import { useI18n } from '../i18n'
import type { PhotoView } from '../photoStore'

interface Props {
  photos: PhotoView[]
  /** prints another device deleted; kept here because this device holds the original */
  remoteDeleted?: Set<string>
  onImportFiles: (files: FileList | File[]) => void
  onDropFromSlot: () => void
  onDeletePhoto: (id: string) => void
}

export function Tray({ photos, remoteDeleted, onImportFiles, onDropFromSlot, onDeletePhoto }: Props) {
  const { t } = useI18n()
  const [over, setOver] = useState(false)
  const [explain, setExplain] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const anyRemoteDeleted = photos.some((p) => remoteDeleted?.has(p.id))

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
        {anyRemoteDeleted && (
          // works without hover, so it reads on the iPad too
          <button className="tray-note" onClick={() => setExplain((s) => !s)} aria-expanded={explain}>
            {t('remoteDeletedNote')}
          </button>
        )}
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
      {explain && anyRemoteDeleted && <p className="tray-explain">{t('remoteDeletedTitle')}</p>}
      <div className="tray-photos">
        {photos.length === 0 && <p className="tray-empty">{t('trayEmpty')}</p>}
        {photos.map((p) => (
          <div key={p.id} className="tray-photo">
            <img
              src={p.thumbUrl}
              alt={p.name}
              // the chip is only ~50px wide on a portrait print: the print
              // itself carries the full wording
              title={remoteDeleted?.has(p.id) ? `${p.name} — ${t('remoteDeletedOne')}` : p.name}
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
            {remoteDeleted?.has(p.id) && <span className="tray-chip">{t('remoteDeleted')}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
