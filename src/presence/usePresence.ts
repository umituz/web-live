import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoomParticipant } from '../core/types'
import { parseParticipants } from '../core/types'
import { PRESENCE_BEAT_MS } from '../core/constants'
import type { PresenceTransport } from './transport'

export interface RoomPresenceState {
  /** This client's mailbox address (shared with the WebRTC layer). */
  clientId: string
  participants: RoomParticipant[]
  /** Other participants (excluding this client) with a raised hand. */
  raisedHands: RoomParticipant[]
  handRaised: boolean
  toggleHand: () => void
  /** True when the server rejected the heartbeat because the room is full. */
  roomFull: boolean
}

/**
 * Room presence over heartbeats: beats this client's state (clientId-keyed,
 * so two tabs of the same user count separately) every 8s and receives the
 * fresh participant list back. Hand raises are synced through the same
 * channel and flush immediately instead of waiting for the next beat.
 */
export function usePresence({
  enabled,
  micOn,
  camOn,
  clientId,
  transport,
}: {
  enabled: boolean
  micOn: boolean
  camOn: boolean
  /** Shared identity so signaling and media address the same presence slot. */
  clientId: string
  /** Bound to one room by the caller (see createHttpPresenceTransport). */
  transport: PresenceTransport | null
}): RoomPresenceState {
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [handRaised, setHandRaised] = useState(false)
  const [roomFull, setRoomFull] = useState(false)

  // The heartbeat always sends the CURRENT state, so the toggles live in refs
  // that the interval closure can read without being re-created.
  const stateRef = useRef({ handRaised, micOn, camOn })
  stateRef.current = { handRaised, micOn, camOn }

  const beat = useCallback(async () => {
    if (!transport) return
    try {
      const res = await transport.beat({
        clientId,
        handRaised: stateRef.current.handRaised,
        micOn: stateRef.current.micOn,
        camOn: stateRef.current.camOn,
      })
      setRoomFull(false)
      setParticipants(parseParticipants(res?.participants))
    } catch (err) {
      const status = (err as { status?: number } | null)?.status
      if (status === 409) {
        setRoomFull(true)
        return
      }
      // 401/403 (room closed / kicked) and network errors keep the last
      // snapshot; the next beat retries.
    }
  }, [transport, clientId])

  useEffect(() => {
    if (!enabled || !transport) return
    void beat()
    const timer = setInterval(() => void beat(), PRESENCE_BEAT_MS)
    return () => clearInterval(timer)
  }, [beat, enabled, transport])

  // No explicit leave on unmount: the server stamps `at` itself, so a goodbye
  // beat cannot backdate the entry — the 25s TTL prune handles departures.

  const toggleHand = useCallback(() => {
    stateRef.current = { ...stateRef.current, handRaised: !stateRef.current.handRaised }
    setHandRaised(stateRef.current.handRaised)
    void beat()
  }, [beat])

  const raisedHands = participants.filter(
    (entry) => entry.handRaised && entry.clientId !== clientId,
  )

  return { clientId, participants, raisedHands, handRaised, toggleHand, roomFull }
}
