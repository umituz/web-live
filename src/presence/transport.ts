import { PRESENCE_BEAT_MS } from '../core/constants'
import type { JsonRequest } from '../core'

// Single canonical declaration lives in core/types.ts; re-exported so
// presence consumers can import it from this module alone.
export type { JsonRequest }

/** What a heartbeat carries; the server stamps `at` itself. */
export interface PresenceBeat {
  clientId: string
  handRaised: boolean
  micOn: boolean
  camOn: boolean
}

/** Errors a heartbeat transport signals with a `status` property (409 = full). */
export interface PresenceTransportError {
  status?: number
}

/**
 * The seam between the roster and however your backend stores slots.
 * Implementations PUT/PATCH the caller's slot and return the fresh roster;
 * a rejected-full room must throw an error carrying `status: 409`.
 */
export interface PresenceTransport {
  beat(state: PresenceBeat): Promise<{ participants?: unknown }>
}

/** URL plan for the heartbeat endpoint, bound per room by the app. */
export interface PresenceUrlPlan {
  beatUrl: (roomId: string) => string
}

/** REST heartbeat transport: PUT the slot, get the roster back. */
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
