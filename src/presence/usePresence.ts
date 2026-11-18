import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoomParticipant } from '../core/types'
import { parseParticipants } from '../core/types'
import { PRESENCE_BEAT_MS } from '../core/constants'
import type { PresenceTransport } from './transport'

export interface RoomPresenceState {

  clientId: string
  participants: RoomParticipant[]

  raisedHands: RoomParticipant[]
  handRaised: boolean
  toggleHand: () => void

  roomFull: boolean
}

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

  clientId: string

  transport: PresenceTransport | null
}): RoomPresenceState {
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [handRaised, setHandRaised] = useState(false)
  const [roomFull, setRoomFull] = useState(false)

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

    }
  }, [transport, clientId])

  useEffect(() => {
    if (!enabled || !transport) return
    void beat()
    const timer = setInterval(() => void beat(), PRESENCE_BEAT_MS)
    return () => clearInterval(timer)
  }, [beat, enabled, transport])

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
