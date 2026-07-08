import type { PhotoMap } from '../photoStore'
import type { PageState, Spread } from '../types'

interface Props {
  spreads: Spread[]
  photos: PhotoMap
  pageRatio: number
  onSelectSpread: (index: number) => void
}

function MiniPage({ page, photos }: { page: PageState; photos: PhotoMap }) {
  const photo = page.photoId ? photos.get(page.photoId) : undefined
  if (!photo) return <div className="mini-page empty" />
  return (
    <div className="mini-page">
      <img className={`page-img layout-${page.layout}`} src={photo.thumbUrl} alt="" />
    </div>
  )
}

export function Overview({ spreads, photos, pageRatio, onSelectSpread }: Props) {
  return (
    <div className="overview">
      {spreads.map((spread, i) => (
        <div key={spread.id} className="mini-spread-wrap" onClick={() => onSelectSpread(i)}>
          <div className="mini-spread" style={{ aspectRatio: `${pageRatio * 2}` }}>
            <MiniPage page={spread.left} photos={photos} />
            <div className="gutter" />
            <MiniPage page={spread.right} photos={photos} />
          </div>
          <span className="mini-label">
            p{i * 2 + 2}–{i * 2 + 3}
          </span>
        </div>
      ))}
    </div>
  )
}
