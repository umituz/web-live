export interface BroadcastChatMessage {
  id: string
  at: number
  kind: 'text' | 'join' | 'system' | 'gift' | 'paid' | 'cohost'
  userId: string
  userName: string
  text?: string
}

export function appendFeed(
  window: readonly BroadcastChatMessage[],
  incoming: readonly BroadcastChatMessage[],
  cap = 120,
): BroadcastChatMessage[] {

  const seen = new Set(window.map((message) => message.id))
  const merged = [...window]
  for (const message of incoming) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    merged.push(message)
  }
  return merged.length > cap ? merged.slice(merged.length - cap) : merged
}

export function nextFeedCursor(window: readonly BroadcastChatMessage[]): string | null {
  const last = window[window.length - 1]
  return last === undefined ? null : last.id
}
