// Minimal typings for the parts of StPageFlip we use (the package ships none).
declare module 'page-flip' {
  export interface FlipSettings {
    width: number
    height: number
    size?: 'fixed' | 'stretch'
    startPage?: number
    drawShadow?: boolean
    maxShadowOpacity?: number
    flippingTime?: number
    usePortrait?: boolean
    showCover?: boolean
    mobileScrollSupport?: boolean
    useMouseEvents?: boolean
    swipeDistance?: number
    showPageCorners?: boolean
    disableFlipByClick?: boolean
  }

  export class PageFlip {
    constructor(element: HTMLElement, settings: FlipSettings)
    loadFromImages(images: string[]): void
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void
    flipNext(corner?: 'top' | 'bottom'): void
    flipPrev(corner?: 'top' | 'bottom'): void
    turnToPage(page: number): void
    getCurrentPageIndex(): number
    getPageCount(): number
    update(): void
    destroy(): void
    on(event: string, callback: (e: { data: unknown }) => void): void
    off(event: string): void
  }
}
