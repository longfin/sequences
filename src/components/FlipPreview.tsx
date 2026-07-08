import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageFlip } from 'page-flip'
import { useI18n } from '../i18n'
import type { PhotoMap } from '../photoStore'
import type { PageState, Spread } from '../types'

interface Props {
  spreads: Spread[]
  photos: PhotoMap
  pageRatio: number
  startIndex: number
  onExit: (lastIndex: number) => void
}

function computeDims(pageRatio: number) {
  const maxH = window.innerHeight * 0.82
  const maxSpreadW = window.innerWidth * 0.9
  const w = Math.max(160, Math.min(maxSpreadW / 2, maxH * pageRatio))
  return { w: Math.round(w), h: Math.round(w / pageRatio) }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Rasterize one page — paper, photo (cover / margin layout) and folio — into
// a bitmap for PageFlip's canvas renderer. Doing the compositing ourselves
// means the page-turn is drawn entirely inside a single <canvas>, immune to
// the DOM clip-path/transform glitches of the HTML renderer.
async function renderPage(
  page: PageState,
  photos: PhotoMap,
  folio: number,
  side: 'left' | 'right',
  w: number,
  h: number,
  scale: number,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  // paper (approximation of the 105deg CSS gradient)
  const grad = ctx.createLinearGradient(0, 0, w, h * 0.27)
  grad.addColorStop(0, '#f5f3ee')
  grad.addColorStop(1, '#efece6')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const photo = page.photoId ? photos.get(page.photoId) : undefined
  const img = photo ? await loadImage(photo.thumbUrl) : null
  if (img) {
    if (page.layout === 'full') {
      // cover-crop the page
      const s = Math.max(w / img.width, h / img.height)
      const dw = img.width * s
      const dh = img.height * s
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    } else {
      // contain within uniform 8% margins
      const bw = w * 0.84
      const bh = h * 0.84
      const s = Math.min(bw / img.width, bh / img.height)
      const dw = img.width * s
      const dh = img.height * s
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    }
  }

  // spine-side crease, matching the edit strip's fold shadow: a narrow warm
  // gradient that reads as paper curving into the binding
  const creaseW = w * 0.1
  const crease =
    side === 'left'
      ? ctx.createLinearGradient(w, 0, w - creaseW, 0)
      : ctx.createLinearGradient(0, 0, creaseW, 0)
  crease.addColorStop(0, 'rgba(58, 48, 32, 0.2)')
  crease.addColorStop(0.45, 'rgba(58, 48, 32, 0.06)')
  crease.addColorStop(1, 'rgba(58, 48, 32, 0)')
  ctx.fillStyle = crease
  ctx.fillRect(side === 'left' ? w - creaseW : 0, 0, creaseW, h)

  // folio
  const fs = Math.max(8, Math.min(11, w * 0.019))
  ctx.font = `${fs}px "IBM Plex Mono", ui-monospace, monospace`
  ctx.fillStyle = '#a9a396'
  ctx.textBaseline = 'bottom'
  const y = h * 0.975
  if (side === 'left') {
    ctx.textAlign = 'left'
    ctx.fillText(String(folio), w * 0.035, y)
  } else {
    ctx.textAlign = 'right'
    ctx.fillText(String(folio), w * 0.965, y)
  }

  return canvas.toDataURL('image/jpeg', 0.9)
}

export function FlipPreview({ spreads, photos, pageRatio, startIndex, onExit }: Props) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const pfRef = useRef<PageFlip | null>(null)

  const startSpread = Math.min(startIndex, Math.max(0, spreads.length - 1))
  const [spreadIdx, setSpreadIdx] = useState(startSpread)
  // Latest position for handlers/effects that shouldn't re-subscribe on it.
  const spreadIdxRef = useRef(startSpread)

  const [dims, setDims] = useState(() => computeDims(pageRatio))
  useEffect(() => {
    const onResize = () => setDims(computeDims(pageRatio))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pageRatio])

  // The book is a flat run of pages; each spread contributes its verso then
  // recto. Folios start at 2 (the front matter isn't sequenced here).
  const pages = useMemo(
    () =>
      spreads.flatMap((s, i) => [
        { page: s.left, folio: i * 2 + 2, side: 'left' as const },
        { page: s.right, folio: i * 2 + 3, side: 'right' as const },
      ]),
    [spreads],
  )

  // Build (or rebuild, on resize) the canvas book. PageFlip.destroy() removes
  // the element it was constructed on, so it gets a throwaway div that React
  // doesn't manage.
  useEffect(() => {
    const host = hostRef.current
    if (!host || pages.length === 0) return
    let cancelled = false
    const mount = document.createElement('div')
    let pf: PageFlip | null = null

    const scale = Math.min(2, window.devicePixelRatio || 1)
    Promise.all(
      pages.map((p) => renderPage(p.page, photos, p.folio, p.side, dims.w, dims.h, scale)),
    ).then((urls) => {
      if (cancelled) return
      host.appendChild(mount)
      pf = new PageFlip(mount, {
        width: dims.w,
        height: dims.h,
        size: 'fixed',
        startPage: spreadIdxRef.current * 2,
        drawShadow: true,
        // keep the sweeping turn-shadow faint — the room is already dim and
        // the baked-in spine crease carries the paper feel
        maxShadowOpacity: 0.16,
        flippingTime: 800,
        usePortrait: false,
        showCover: false,
        mobileScrollSupport: false,
        useMouseEvents: true,
        swipeDistance: 30,
        showPageCorners: false,
        disableFlipByClick: false,
      })
      pf.loadFromImages(urls)
      pf.on('flip', (e) => {
        const s = Math.floor((e.data as number) / 2)
        spreadIdxRef.current = s
        setSpreadIdx(s)
      })
      pfRef.current = pf
    })

    return () => {
      cancelled = true
      pfRef.current = null
      if (pf) {
        try {
          pf.destroy() // also removes `mount` from the DOM
        } catch {
          mount.remove()
        }
      } else {
        mount.remove()
      }
    }
  }, [pages, photos, dims.w, dims.h])

  const flip = useCallback((dir: 1 | -1) => {
    const pf = pfRef.current
    if (!pf) return
    if (dir > 0) pf.flipNext()
    else pf.flipPrev()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') flip(1)
      else if (e.key === 'ArrowLeft') flip(-1)
      else if (e.key === 'Escape') onExit(spreadIdxRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flip, onExit])

  if (spreads.length === 0) return null

  return (
    <div className="flip-preview">
      <button className="preview-exit" onClick={() => onExit(spreadIdxRef.current)}>
        {t('close')}
      </button>

      <div
        ref={hostRef}
        className="flip-book"
        style={{ width: dims.w * 2, height: dims.h }}
      />

      <div className="preview-nav">
        <button onClick={() => flip(-1)} disabled={spreadIdx === 0}>
          {t('prev')}
        </button>
        <span>
          {spreadIdx + 1} / {spreads.length}{' '}
          <em>
            (p{spreadIdx * 2 + 2}–{spreadIdx * 2 + 3})
          </em>
        </span>
        <button onClick={() => flip(1)} disabled={spreadIdx === spreads.length - 1}>
          {t('next')}
        </button>
      </div>
    </div>
  )
}
