import { useCallback, useEffect, useState } from 'react'
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

function PreviewPage({
  page,
  photos,
  folio,
  side,
}: {
  page: PageState
  photos: PhotoMap
  folio: number
  side: 'left' | 'right'
}) {
  const photo = page.photoId ? photos.get(page.photoId) : undefined
  return (
    <div className={`preview-page ${side}`}>
      {photo && <img className={`page-img layout-${page.layout}`} src={photo.thumbUrl} alt="" />}
      <span className={`folio ${side}`}>{folio}</span>
    </div>
  )
}

interface Turn {
  from: number
  to: number
  dir: 1 | -1
}

export function FlipPreview({ spreads, photos, pageRatio, startIndex, onExit }: Props) {
  const { t } = useI18n()
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, spreads.length - 1)))
  const [turn, setTurn] = useState<Turn | null>(null)

  const go = useCallback(
    (delta: number) => {
      if (turn) return
      const to = Math.max(0, Math.min(spreads.length - 1, index + delta))
      if (to === index) return
      setTurn({ from: index, to, dir: delta > 0 ? 1 : -1 })
    },
    [turn, index, spreads.length],
  )

  const commit = useCallback(() => {
    if (!turn) return
    setIndex(turn.to)
    setTurn(null)
  }, [turn])

  // safety net in case animationend never fires
  useEffect(() => {
    if (!turn) return
    const t = window.setTimeout(commit, 900)
    return () => window.clearTimeout(t)
  }, [turn, commit])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') onExit(turn ? turn.to : index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onExit, turn, index])

  if (spreads.length === 0) return null

  // While a leaf is turning, the side it will land on already shows the
  // target spread's page underneath.
  const baseLeftIdx = turn ? (turn.dir === -1 ? turn.to : turn.from) : index
  const baseRightIdx = turn ? (turn.dir === 1 ? turn.to : turn.from) : index
  const shownIdx = turn ? turn.to : index

  return (
    <div className="flip-preview" onClick={() => go(1)}>
      <button
        className="preview-exit"
        onClick={(e) => {
          e.stopPropagation()
          onExit(turn ? turn.to : index)
        }}
      >
        {t('close')}
      </button>
      <div
        className="preview-spread"
        style={{
          aspectRatio: `${pageRatio * 2}`,
          width: `min(86vw, ${160 * pageRatio}vh)`,
        }}
      >
        <PreviewPage
          page={spreads[baseLeftIdx].left}
          photos={photos}
          folio={baseLeftIdx * 2 + 2}
          side="left"
        />
        <div className="preview-gutter" />
        <PreviewPage
          page={spreads[baseRightIdx].right}
          photos={photos}
          folio={baseRightIdx * 2 + 3}
          side="right"
        />
        {turn && (
          <div
            className={`flip-leaf ${turn.dir === 1 ? 'fwd' : 'bwd'}`}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) commit()
            }}
          >
            <div className="leaf-face front">
              {turn.dir === 1 ? (
                <PreviewPage
                  page={spreads[turn.from].right}
                  photos={photos}
                  folio={turn.from * 2 + 3}
                  side="right"
                />
              ) : (
                <PreviewPage
                  page={spreads[turn.from].left}
                  photos={photos}
                  folio={turn.from * 2 + 2}
                  side="left"
                />
              )}
            </div>
            <div className="leaf-face back">
              {turn.dir === 1 ? (
                <PreviewPage
                  page={spreads[turn.to].left}
                  photos={photos}
                  folio={turn.to * 2 + 2}
                  side="left"
                />
              ) : (
                <PreviewPage
                  page={spreads[turn.to].right}
                  photos={photos}
                  folio={turn.to * 2 + 3}
                  side="right"
                />
              )}
            </div>
          </div>
        )}
      </div>
      <div className="preview-nav" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => go(-1)} disabled={shownIdx === 0 && !turn}>
          {t('prev')}
        </button>
        <span>
          {shownIdx + 1} / {spreads.length}{' '}
          <em>
            (p{shownIdx * 2 + 2}–{shownIdx * 2 + 3})
          </em>
        </span>
        <button onClick={() => go(1)} disabled={shownIdx === spreads.length - 1 && !turn}>
          {t('next')}
        </button>
      </div>
    </div>
  )
}
