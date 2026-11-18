import { PRESENCE_BEAT_MS } from '../core/constants'
import type { JsonRequest } from '../core'

export type { JsonRequest }

export interface PresenceBeat {
  clientId: string
  handRaised: boolean
  micOn: boolean
  camOn: boolean
}

export interface PresenceTransportError {
  status?: number
}

export interface PresenceTransport {
  beat(state: PresenceBeat): Promise<{ participants?: unknown }>
}

export interface PresenceUrlPlan {
  beatUrl: (roomId: string) => string
}

export function createHttpPresenceTransport(input: {
  roomId: string
  urls: PresenceUrlPlan
  request: JsonRequest
}): PresenceTransport {
  const { roomId, urls, request } = input
  return {
    async beat(state) {
      return request<{ participants?: unknown }>(urls.beatUrl(roomId), {
        method: 'PUT',
        json: state,
      })
    },
  }
}

export { PRESENCE_BEAT_MS }
