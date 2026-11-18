import { describe, expect, it } from 'vitest'
import { appendFeed, nextFeedCursor } from './chatFeed'
import type { BroadcastChatMessage } from './chatFeed'

const line = (
  id: string,
  at = 0,
  over: Partial<BroadcastChatMessage> = {},
): BroadcastChatMessage => ({
  id,
  at,
  kind: 'text',
  userId: 'u-1',
  userName: 'Ada',
  text: `line ${id}`,
  ...over,
})

describe('appendFeed', () => {
  it('appends incoming lines newest-last, preserving their order', () => {
    const window = [line('a', 1), line('b', 2)]
    const next = appendFeed(window, [line('c', 3), line('d', 4)])
    expect(next.map((message) => message.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('dedupes by id keeping the first occurrence', () => {
    const window = [line('a', 1, { text: 'original' })]
    const next = appendFeed(window, [
      line('a', 2, { text: 'replayed' }),
      line('b', 3),
      line('b', 4, { text: 'second copy' }),
    ])
    expect(next.map((message) => message.id)).toEqual(['a', 'b'])
    expect(next[0]?.text).toBe('original')
    expect(next[1]?.text).toBe('line b')
  })

  it('drops the oldest lines beyond the cap', () => {
    const window = [line('a'), line('b'), line('c')]
    const next = appendFeed(window, [line('d'), line('e')], 4)
    expect(next.map((message) => message.id)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('keeps only the last cap lines when one batch overflows the default cap', () => {
    const batch = Array.from({ length: 130 }, (_, i) => line(`m${i}`, i))
    const next = appendFeed([], batch)
    expect(next.length).toBe(120)
    expect(next[0]?.id).toBe('m10')
    expect(next[next.length - 1]?.id).toBe('m129')
  })
})

describe('nextFeedCursor', () => {
  it('returns the last message id as the resume cursor', () => {
    expect(nextFeedCursor([line('a'), line('b'), line('c')])).toBe('c')
  })

  it('returns null for an empty window', () => {
    expect(nextFeedCursor([])).toBeNull()
  })

  it('round-trips: replaying the tail after the cursor is a no-op', () => {
    let window = appendFeed([], [line('a'), line('b'), line('c')])
    expect(nextFeedCursor(window)).toBe('c')

    window = appendFeed(window, [line('b'), line('c'), line('d')])
    expect(window.map((message) => message.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
