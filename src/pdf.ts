import { jsPDF } from 'jspdf'
import { getPhotoBlob } from './db'
import type { PageState, Project } from './types'

const PAGE_H_MM = 200
const MARGIN_RATIO = 0.08
const RENDER_H_PX = 1400

async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob)
}

/**
 * Render one page to a canvas: 'full' cover-crops to the page,
 * 'margin' letterboxes the image inside a uniform margin on white.
 */
function renderPage(
  bitmap: ImageBitmap,
  layout: PageState['layout'],
  pageW: number,
  pageH: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = pageW
  canvas.height = pageH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, pageW, pageH)

  const iw = bitmap.width
  const ih = bitmap.height

  if (layout === 'full') {
    const scale = Math.max(pageW / iw, pageH / ih)
    const dw = iw * scale
    const dh = ih * scale
    ctx.drawImage(bitmap, (pageW - dw) / 2, (pageH - dh) / 2, dw, dh)
  } else {
    const m = Math.round(pageW * MARGIN_RATIO)
    const availW = pageW - m * 2
    const availH = pageH - m * 2
    const scale = Math.min(availW / iw, availH / ih)
    const dw = iw * scale
    const dh = ih * scale
    ctx.drawImage(bitmap, (pageW - dw) / 2, (pageH - dh) / 2, dw, dh)
  }
  return canvas
}

export async function exportPdf(project: Project, onProgress?: (done: number, total: number) => void) {
  const pageWmm = PAGE_H_MM * project.pageRatio
  const spreadWmm = pageWmm * 2

  const doc = new jsPDF({
    orientation: spreadWmm >= PAGE_H_MM ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [spreadWmm, PAGE_H_MM],
  })

  const pageHpx = RENDER_H_PX
  const pageWpx = Math.round(pageHpx * project.pageRatio)

  for (let i = 0; i < project.spreads.length; i++) {
    const spread = project.spreads[i]
    if (i > 0) doc.addPage([spreadWmm, PAGE_H_MM], spreadWmm >= PAGE_H_MM ? 'landscape' : 'portrait')

    const sides: Array<['left' | 'right', PageState]> = [
      ['left', spread.left],
      ['right', spread.right],
    ]
    for (const [side, page] of sides) {
      if (!page.photoId) continue
      const blob = await getPhotoBlob(page.photoId)
      if (!blob) continue
      const bitmap = await blobToBitmap(blob)
      const canvas = renderPage(bitmap, page.layout, pageWpx, pageHpx)
      bitmap.close()
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      const x = side === 'left' ? 0 : pageWmm
      doc.addImage(dataUrl, 'JPEG', x, 0, pageWmm, PAGE_H_MM)
    }

    // gutter line
    doc.setDrawColor(200)
    doc.setLineWidth(0.2)
    doc.line(pageWmm, 0, pageWmm, PAGE_H_MM)

    // page numbers (p2/p3 …, assuming p1 is a title page)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(String(i * 2 + 2), 4, PAGE_H_MM - 4)
    doc.text(String(i * 2 + 3), spreadWmm - 4, PAGE_H_MM - 4, { align: 'right' })

    onProgress?.(i + 1, project.spreads.length)
  }

  doc.save('sequence.pdf')
}
