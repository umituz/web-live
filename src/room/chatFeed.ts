/** One line of a stream-style broadcast chat window (one host, many viewers). */
export interface BroadcastChatMessage {
  id: string
  at: number
  kind: 'text' | 'join' | 'system' | 'gift' | 'paid' | 'cohost'
  userId: string
  userName: string
  text?: string
}

/**
 * Pure window reducer for a broadcast chat feed: incoming lines are
 * appended newest-last, an id the viewer already has is skipped (keeping
 * the first occurrence — a replayed tail must not double-render a line),
 * and once the window outgrows the cap the OLDEST lines fall off, so a
 * hours-long stream cannot grow the DOM without bound.
 */
export function appendFeed(
  window: readonly BroadcastChatMessage[],
  incoming: readonly BroadcastChatMessage[],
  cap = 120,
): BroadcastChatMessage[] {
  // Dedupe against the full pre-cap window, not the trimmed result: a
  // line that already scrolled away must not reappear on a replay either.
  const seen = new Set(window.map((message) => message.id))
  const merged = [...window]
  for (const message of incoming) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    merged.push(message)
  }
  return merged.length > cap ? merged.slice(merged.length - cap) : merged
}

/**
 * Resume cursor for reconnecting viewers: the id of the newest visible
 * line. The server replays everything after it; `appendFeed` dedupes the
 * overlap. Null when nothing has been shown yet.
 */
export function nextFeedCursor(window: readonly BroadcastChatMessage[]): string | null {
  const last = window[window.length - 1]
  return last === undefined ? null : last.id
}
