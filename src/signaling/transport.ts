import type { WirePayload } from './negotiate'
import { buildSignalBody } from './negotiate'
import type { JsonRequest } from '../core'

export type { JsonRequest }

export interface SignalTransport {

  send(input: { from: string; to: string; payload: WirePayload }): Promise<boolean>

  consume(clientId: string): Promise<unknown[]>
}

export interface SignalUrlPlan {
  sendUrl: (roomId: string) => string
  consumeUrl: (roomId: string) => string
}

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

        return []
      }
    },
  }
}
