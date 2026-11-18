export interface CaptionItem {
  id: string
  text: string
}

export const CAPTION_BATCH_MAX_LINES = 5

export const CAPTION_BATCH_WINDOW_MS = 10_000

export const CAPTION_LESSON_CAP = 30

export interface CaptionBatcherState {
  pending: CaptionItem[]
  batchesSent: number
  linesTranslated: number

  blocked: boolean
}

export function initialCaptionBatcher(): CaptionBatcherState {
  return { pending: [], batchesSent: 0, linesTranslated: 0, blocked: false }
}

export function pushCaption(state: CaptionBatcherState, item: CaptionItem): CaptionBatcherState {
  if (state.blocked || item.text.trim().length === 0) return state
  if (state.pending.some((entry) => entry.id === item.id)) return state
  return { ...state, pending: [...state.pending, item] }
}

export function captionBatchDue(
  state: CaptionBatcherState,
  windowElapsedMs: number,
): CaptionItem[] | null {
  if (state.pending.length === 0) return null
  if (state.pending.length >= CAPTION_BATCH_MAX_LINES) {
    return state.pending.slice(0, CAPTION_BATCH_MAX_LINES)
  }
  if (windowElapsedMs >= CAPTION_BATCH_WINDOW_MS) return [...state.pending]
  return null
}

export function captionBatchSent(
  state: CaptionBatcherState,
  sent: CaptionItem[],
): CaptionBatcherState {
  const sentIds = new Set(sent.map((entry) => entry.id))
  return {
    ...state,
    pending: state.pending.filter((entry) => !sentIds.has(entry.id)),
    batchesSent: Math.min(state.batchesSent + 1, CAPTION_LESSON_CAP),
    linesTranslated: state.linesTranslated + sent.length,
    blocked: state.batchesSent + 1 >= CAPTION_LESSON_CAP,
  }
}

export function captionBatchesRemaining(state: CaptionBatcherState): number {
  return Math.max(0, CAPTION_LESSON_CAP - state.batchesSent)
}
