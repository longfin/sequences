import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

/** Zoom state persisted per view, with ctrl/cmd+wheel support on `ref`. */
export function useZoom(storageKey: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoomRaw] = useState(() => {
    const z = parseFloat(localStorage.getItem(storageKey) ?? '1')
    return Number.isFinite(z) ? clampZoom(z) : 1
  })

  const setZoom = (next: number | ((z: number) => number)) => {
    setZoomRaw((z) => clampZoom(typeof next === 'function' ? next(z) : next))
  }

  useEffect(() => {
    localStorage.setItem(storageKey, String(zoom))
  }, [storageKey, zoom])

  // ctrl/cmd + wheel zooms (needs a non-passive listener)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoomRaw((z) => clampZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return { zoom, setZoom, ref }
}

export function ZoomControl({
  zoom,
  setZoom,
}: {
  zoom: number
  setZoom: (next: number | ((z: number) => number)) => void
}) {
  const { t } = useI18n()
  return (
    <div className="zoom-control">
      <button title={t('zoomOut')} disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => z - 0.1)}>
        −
      </button>
      <button className="zoom-value" title={t('zoomReset')} onClick={() => setZoom(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button title={t('zoomIn')} disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => z + 0.1)}>
        +
      </button>
    </div>
  )
}
