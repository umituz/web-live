// Caption batching for live translation: finalized speech lines queue up
// and go out in small batches so one lesson costs a handful of AI calls
// instead of one per sentence. Pure helpers — the timer lives in the hook.

export interface CaptionItem {
  id: string
  text: string
}

/** Flush as soon as the batch reaches this size. */
export const CAPTION_BATCH_MAX_LINES = 5
/** …or when this much time has passed since the first queued line. */
export const CAPTION_BATCH_WINDOW_MS = 10_000
/** Soft lesson-wide cap on AI translation batches (plan-friendliness). */
export const CAPTION_LESSON_CAP = 30

export interface CaptionBatcherState {
  pending: CaptionItem[]
  batchesSent: number
  linesTranslated: number
  /** Once true (cap hit / quota refused) translation stops for the lesson. */
  blocked: boolean
}

export function initialCaptionBatcher(): CaptionBatcherState {
  return { pending: [], batchesSent: 0, linesTranslated: 0, blocked: false }
}

/** Queue one finalized line (deduped by id, empties dropped). */
export function pushCaption(state: CaptionBatcherState, item: CaptionItem): CaptionBatcherState {
  if (state.blocked || item.text.trim().length === 0) return state
  if (state.pending.some((entry) => entry.id === item.id)) return state
  return { ...state, pending: [...state.pending, item] }
}

/**
 * What should go out right now: a full batch once MAX_LINES lines queued,
 * otherwise whatever is pending once the window has elapsed. `null` means
 * keep waiting.
 */
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

/** Applies a successful flush; enforces the lesson-wide batch cap. */
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

/** How many more batches the lesson has left (for the remaining badge). */
export function captionBatchesRemaining(state: CaptionBatcherState): number {
  return Math.max(0, CAPTION_LESSON_CAP - state.batchesSent)
}
