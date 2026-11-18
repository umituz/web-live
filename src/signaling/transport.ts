import type { WirePayload } from './negotiate'
import { buildSignalBody } from './negotiate'
import type { JsonRequest } from '../core'

// Single canonical declaration lives in core/types.ts; re-exported so
// signaling consumers can import it from this module alone.
export type { JsonRequest }

/**
 * The one seam between the peer mesh and however your backend stores
 * envelopes. Implementations must be atomic per clientId: a consume call
 * claims (and removes) exactly the rows addressed to that client, so two
 * tabs of the same user never see the same signal twice.
 */
export interface SignalTransport {
  /** Drop one envelope into the mailbox. Resolves false when undeliverable. */
  send(input: { from: string; to: string; payload: WirePayload }): Promise<boolean>
  /** Claim every pending envelope addressed to `clientId`, oldest first. */
  consume(clientId: string): Promise<unknown[]>
}

/** URL plan for the two mailbox endpoints, bound per room by the app. */
export interface SignalUrlPlan {
  sendUrl: (roomId: string) => string
  consumeUrl: (roomId: string) => string
}

/**
 * REST mailbox transport. The app supplies the URL plan (e.g.
 * `(roomId) => \`/api/live-room/${roomId}/signal\``) and its own request
 * function — the package stays free of any HTTP client dependency.
 */
export function createHttpSignalTransport(input: {
  roomId: string
  urls: SignalUrlPlan
  request: JsonRequest
}): SignalTransport {
  const { roomId, urls, request } = input
  return {
    async send({ from, to, payload }) {
      const { body, ok } = buildSignalBody(payload)
      if (!ok) return false
      try {
        await request(urls.sendUrl(roomId), {
          method: 'POST',
          json: { from, to, body: JSON.parse(body) as Record<string, unknown> },
        })
        return true
      } catch {
        return false
      }
    },
    async consume(clientId) {
      try {
        const res = await request<{ signals?: unknown }>(urls.consumeUrl(roomId), {
          method: 'POST',
          json: { clientId },
        })
        return Array.isArray(res?.signals) ? res.signals : []
      } catch {
        // Network hiccup or the room closing — the next tick retries.
        return []
      }
    },
  }
}
