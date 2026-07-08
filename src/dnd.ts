import type { DragPayload } from './types'

// dataTransfer.getData() is unavailable during dragover, so the payload
// for in-app drags is kept in module state for the duration of the drag.
let current: DragPayload | null = null

export function setDrag(payload: DragPayload) {
  current = payload
}

export function getDrag(): DragPayload | null {
  return current
}

export function clearDrag() {
  current = null
}
