/**
 * The seam between the room-doc sync and however your backend stores the
 * doc. One method per write the hook performs; reads come back through
 * `fetchMain` and go through `parseRoomMainDoc`, so implementations must
 * return the doc body itself, not an HTTP envelope.
 */
export interface RoomSyncTransport {
  /** The full main room doc; parsed defensively by the hook. */
  fetchMain(): Promise<unknown>
  /**
   * Append one chat line. `id` carries the optimistic entry's id so a
   * backend can store it verbatim — the next poll then reconciles the
   * optimistic line with the stored one instead of duplicating it.
   */
  sendChat(input: { sender: string; text: string; id?: string }): Promise<unknown>
  /** Overwrite the shared notes (the editing lock lives client-side). */
  putNotes(text: string): Promise<unknown>
  /** Move the room's slide pointer. */
  putSlide(index: number): Promise<unknown>
  /** Fire one emoji reaction — identity is the session's job server-side. */
  sendReaction(emoji: string): Promise<unknown>
  /** Claim the screen-share slot, or release it with null. */
  putScreenSharer(clientId: string | null): Promise<unknown>
}

/** See core/types.ts — `apiFetch` satisfies this directly. */
import type { JsonRequest } from '../core'

export type { JsonRequest }

/** URL plan for the six room-doc endpoints, bound per room by the app. */
export interface RoomSyncUrlPlan {
  mainUrl: (roomId: string) => string
  chatUrl: (roomId: string) => string
  notesUrl: (roomId: string) => string
  slideUrl: (roomId: string) => string
  reactionUrl: (roomId: string) => string
  screenUrl: (roomId: string) => string
}

/**
 * REST room-doc transport. The app supplies the URL plan (e.g.
 * `(roomId) => \`/api/live-room/${roomId}/main\``) and its own request
 * function — the package stays free of any HTTP client dependency.
 */
export function createHttpRoomSyncTransport(input: {
  roomId: string
  urls: RoomSyncUrlPlan
  request: JsonRequest
}): RoomSyncTransport {
  const { roomId, urls, request } = input
  return {
    async fetchMain() {
      const res = await request<{ data?: unknown }>(urls.mainUrl(roomId), { method: 'GET' })
      // Envelope tolerance: app-style `{ data }` wrappers are unwrapped,
      // bare doc bodies pass through — parseRoomMainDoc copes with either.
      return res?.data ?? res
    },
    sendChat({ sender, text, id }) {
      return request(urls.chatUrl(roomId), { method: 'POST', json: { sender, text, id } })
    },
    putNotes(text) {
      return request(urls.notesUrl(roomId), { method: 'PUT', json: { notes: text } })
    },
    putSlide(index) {
      return request(urls.slideUrl(roomId), { method: 'PUT', json: { activeSlide: index } })
    },
    sendReaction(emoji) {
      return request(urls.reactionUrl(roomId), { method: 'POST', json: { emoji } })
    },
    putScreenSharer(clientId) {
      return request(urls.screenUrl(roomId), {
        method: 'PUT',
        // A release sends active:false; backends only honor it from the
        // slot owner, so the empty clientId cannot evict someone else.
        json: { clientId: clientId ?? '', active: clientId !== null },
      })
    },
  }
}
