import { useCallback, useEffect, useRef, useState } from 'react'
import { PRESENCE_BEAT_MS } from '../core/constants'
import { useVisiblePolling } from '../hooks'
import type { JsonRequest } from '../core'

export interface AudienceBeat {
  clientId: string
  userId?: string
  name?: string
}

export interface AudienceMember {
  clientId: string
  userId: string
  name: string
  at: number
}

export interface AudienceTransport {
  beat(state: AudienceBeat): Promise<{ members?: unknown }>
}

export interface AudienceUrlPlan {
  beatUrl: (roomId: string) => string
}

export function createHttpAudienceTransport(input: {
  roomId: string
  urls: AudienceUrlPlan
  request: JsonRequest
}): AudienceTransport {
  const { roomId, urls, request } = input
  return {
    async beat(state) {
      return request<{ members?: unknown }>(urls.beatUrl(roomId), {
        method: 'PUT',
        json: state,
      })
    },
  }
}

export function parseAudienceMembers(raw: unknown): AudienceMember[] {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null
      ? Object.values(raw)
      : []
  return source.filter(
    (entry): entry is AudienceMember =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as AudienceMember).clientId === 'string' &&
      (entry as AudienceMember).clientId.length > 0,
  )
}

export interface AudienceState {
  clientId: string
  members: AudienceMember[]
  count: number
}

export function useAudience({
  enabled,
  clientId,
  identity,
  transport,
}: {
  enabled: boolean
  clientId: string
  identity: { userId?: string; name?: string }
  transport: AudienceTransport | null
}): AudienceState {
  const [members, setMembers] = useState<AudienceMember[]>([])
  const identityRef = useRef(identity)
  identityRef.current = identity

  const beat = useCallback(async () => {
    if (!transport) return
    try {
      const res = await transport.beat({
        clientId,
        userId: identityRef.current.userId,
        name: identityRef.current.name,
      })
      setMembers(parseAudienceMembers(res?.members))
    } catch {

    }
  }, [transport, clientId])

  useEffect(() => {
    setMembers([])
  }, [transport])

  useEffect(() => {
    if (!enabled || !transport) return
    void beat()
  }, [beat, enabled, transport])

  useVisiblePolling(() => void beat(), PRESENCE_BEAT_MS)

  return { clientId, members, count: members.length }
}
