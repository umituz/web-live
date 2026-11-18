import { describe, expect, it } from 'vitest'
import {
  CAPTION_BATCH_MAX_LINES,
  CAPTION_BATCH_WINDOW_MS,
  CAPTION_LESSON_CAP,
  captionBatchDue,
  captionBatchSent,
  captionBatchesRemaining,
  initialCaptionBatcher,
  pushCaption,
  type CaptionItem,
} from './captionBatcher'

const item = (id: string): CaptionItem => ({ id, text: `line ${id}` })

describe('pushCaption', () => {
  it('queues lines and drops empties and duplicates', () => {
    let state = initialCaptionBatcher()
    state = pushCaption(state, item('a'))
    state = pushCaption(state, item('a'))
    state = pushCaption(state, { id: 'b', text: '   ' })
    state = pushCaption(state, item('c'))
    expect(state.pending.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('ignores lines once blocked', () => {
    let state = { ...initialCaptionBatcher(), blocked: true }
    state = pushCaption(state, item('a'))
    expect(state.pending.length).toBe(0)
  })
})

describe('captionBatchDue', () => {
  it('waits until five lines queue up', () => {
    let state = initialCaptionBatcher()
    for (const id of ['a', 'b', 'c', 'd']) state = pushCaption(state, item(id))

    expect(captionBatchDue(state, CAPTION_BATCH_WINDOW_MS - 1)).toBeNull()
    state = pushCaption(state, item('e'))
    const due = captionBatchDue(state, 100)
    expect(due?.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(CAPTION_BATCH_MAX_LINES).toBe(5)
  })

  it('flushes a short batch once the window elapses', () => {
    let state = initialCaptionBatcher()
    state = pushCaption(state, item('only'))
    expect(captionBatchDue(state, CAPTION_BATCH_WINDOW_MS - 1)).toBeNull()
    expect(captionBatchDue(state, CAPTION_BATCH_WINDOW_MS)?.map((entry) => entry.id)).toEqual(['only'])
  })

  it('caps a batch at five even with more queued', () => {
    let state = initialCaptionBatcher()
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) state = pushCaption(state, item(id))
    expect(captionBatchDue(state, 0)?.length).toBe(5)
  })
})

describe('lesson cap + remaining', () => {
  it('counts batches, blocks at the cap and reports the remainder', () => {
    let state = initialCaptionBatcher()
    for (let i = 0; i < CAPTION_LESSON_CAP - 1; i += 1) {
      state = captionBatchSent(state, [item(`b${i}`)])
    }
    expect(captionBatchesRemaining(state)).toBe(1)
    expect(state.blocked).toBe(false)

    state = captionBatchSent(state, [item('last')])
    expect(state.blocked).toBe(true)
    expect(captionBatchesRemaining(state)).toBe(0)
    expect(captionBatchDue(pushCaption(state, item('x')), 999_999)).toBeNull()
  })

  it('removes flushed lines from pending', () => {
    let state = initialCaptionBatcher()
    for (const id of ['a', 'b', 'c', 'd', 'e']) state = pushCaption(state, item(id))
    const due = captionBatchDue(state, 0)!
    state = captionBatchSent(state, due)
    expect(state.pending.length).toBe(0)
    expect(state.linesTranslated).toBe(5)
  })
})
