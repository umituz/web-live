export interface RoomDocTransport {

  fetchMain(): Promise<unknown>

  sendChat(input: { sender: string; text: string; id?: string }): Promise<unknown>

  putNotes(text: string): Promise<unknown>

  putSlide(index: number): Promise<unknown>

  sendReaction(emoji: string): Promise<unknown>

  putScreenSharer(clientId: string | null): Promise<unknown>
}

import type { JsonRequest } from '../core'

export type { JsonRequest }

export interface RoomDocUrlPlan {
  mainUrl: (roomId: string) => string
  chatUrl: (roomId: string) => string
  notesUrl: (roomId: string) => string
  slideUrl: (roomId: string) => string
  reactionUrl: (roomId: string) => string
  screenUrl: (roomId: string) => string
}

export function createHttpRoomDocTransport(input: {
  roomId: string
  urls: RoomDocUrlPlan
  request: JsonRequest
}): RoomDocTransport {
  const { roomId, urls, request } = input
  return {
    async fetchMain() {
      const res = await request<{ data?: unknown }>(urls.mainUrl(roomId), { method: 'GET' })

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

        json: { clientId: clientId ?? '', active: clientId !== null },
      })
    },
  }
}
