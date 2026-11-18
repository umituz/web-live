import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSignalMailbox } from '../signaling'
import {
  isSignalRelevantForPeer,
  isStaleOffer,
  isUsableDescription,
  summarizeConnection,
} from '../signaling'
import type {
  LiveSignal,
  PeerState,
  RoomConnection,
  SignalTransport,
  WirePayload,
} from '../signaling'
import type { RoomParticipant } from '../core'
import { useTransportStats } from './useTransportStats'
import type { TransportStatsState } from './useTransportStats'

export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

const ICE_GATHER_TIMEOUT_MS = 2_500

const LOCAL_STREAM_WAIT_MS = 30_000

const HELLO_THROTTLE_MS = 5_000

type EnsureMode = 'auto' | 'force' | 'renegotiate'

export interface PeerMeshState {

  remoteStreams: Record<string, MediaStream>
  peerStates: Record<string, PeerState>
  connection: RoomConnection

  getLastVideoTrack: (peerId: string) => MediaStreamTrack | null

  stats: TransportStatsState

  restart: () => void
}

export function electHubClientIds(participants: readonly RoomParticipant[]): string[] {
  return participants
    .filter((entry) => entry.isHost)
    .map((entry) => entry.clientId)
    .sort()
}

function gatherComplete(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function descriptionOf(desc: RTCSessionDescription | null): { type: string; sdp: string } | null {
  if (!desc || typeof desc.sdp !== 'string' || desc.sdp.length === 0) return null
  return { type: desc.type, sdp: desc.sdp }
}

export function usePeerMesh({
  transport,
  enabled,
  clientId,
  participants,
  localStream,
  mediaBlocked,
  screenStream,
  screenSharerId,
  iceServers,
}: {

  transport: SignalTransport | null
  enabled: boolean
  clientId: string
  participants: RoomParticipant[]
  localStream: MediaStream | null
  mediaBlocked: boolean

  screenStream?: MediaStream | null

  screenSharerId?: string | null

  iceServers?: RTCIceServer[]
}): PeerMeshState {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({})

  const pcsRef = useRef(new Map<string, RTCPeerConnection>())
  const peerStreamsRef = useRef(new Map<string, MediaStream>())
  const peerVideoOrderRef = useRef<Record<string, MediaStreamTrack[]>>({})
  const epochsRef = useRef<Record<string, number>>({})
  const appliedOfferEpochsRef = useRef<Record<string, number>>({})
  const offerInFlightRef = useRef(new Set<string>())
  const answerInFlightRef = useRef(new Set<string>())
  const helloAtRef = useRef<Record<string, number>>({})
  const sendRef = useRef<(to: string, signal: WirePayload) => Promise<boolean>>(
    async () => false,
  )
  const ensurePeerRef = useRef<(peerId: string, mode?: EnsureMode) => Promise<void>>(
    async () => {},
  )
  const isHubRef = useRef(false)
  const hubIdRef = useRef('')
  const clientIdRef = useRef(clientId)
  clientIdRef.current = clientId
  const localStreamRef = useRef<MediaStream | null>(localStream)
  localStreamRef.current = localStream
  const mediaBlockedRef = useRef(mediaBlocked)
  mediaBlockedRef.current = mediaBlocked
  const screenStreamRef = useRef<MediaStream | null>(screenStream ?? null)
  screenStreamRef.current = screenStream ?? null
  const relayTrackRef = useRef<MediaStreamTrack | null>(null)

  const iceServersRef = useRef<RTCIceServer[]>(iceServers ?? ICE_SERVERS)
  iceServersRef.current = iceServers ?? ICE_SERVERS

  const hostClientIds = useMemo(() => electHubClientIds(participants), [participants])
  const hubClientId = hostClientIds[0] ?? ''
  hubIdRef.current = hubClientId
  const isHub = enabled && hostClientIds[0] === clientId
  isHubRef.current = isHub

  const bumpRemoteStreams = useCallback(() => {
    setRemoteStreams((prev) => ({ ...prev }))
  }, [])

  const ensurePeerStream = useCallback(
    (peerId: string): MediaStream => {
      const existing = peerStreamsRef.current.get(peerId)
      if (existing) return existing
      const stream = new MediaStream()
      peerStreamsRef.current.set(peerId, stream)
      setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }))
      return stream
    },
    [],
  )

  const closePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId)
    pcsRef.current.delete(peerId)
    if (pc) {
      try {
        pc.close()
      } catch {

      }
    }
    peerStreamsRef.current.delete(peerId)
    delete peerVideoOrderRef.current[peerId]
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
    setPeerStates((prev) => {
      if (!(peerId in prev)) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const createPeer = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
    pc.ontrack = (event) => {
      const track = event.track
      const stream = ensurePeerStream(peerId)
      if (!stream.getTracks().some((existing) => existing.id === track.id)) {
        stream.addTrack(track)
      }
      if (track.kind === 'video') {
        const order = (peerVideoOrderRef.current[peerId] ??= [])
        if (!order.some((existing) => existing.id === track.id)) order.push(track)
        track.addEventListener(
          'ended',
          () => {
            const list = peerVideoOrderRef.current[peerId]
            if (list) {
              const at = list.indexOf(track)
              if (at >= 0) list.splice(at, 1)
            }
            stream.removeTrack(track)
            bumpRemoteStreams()
          },
          { once: true },
        )
      }
      bumpRemoteStreams()
    }
    pc.onconnectionstatechange = () => {
      setPeerStates((prev) => ({ ...prev, [peerId]: pc.connectionState as PeerState }))
      if (pc.connectionState === 'failed' && isHubRef.current) {

        void ensurePeerRef.current(peerId, 'force')
      }
    }
    pcsRef.current.set(peerId, pc)
    setPeerStates((prev) => ({ ...prev, [peerId]: pc.connectionState as PeerState }))
    return pc
  }, [bumpRemoteStreams, ensurePeerStream])

  const collectLocalTracks = useCallback((): MediaStreamTrack[] => {
    const tracks: MediaStreamTrack[] = []
    for (const source of [localStreamRef.current, screenStreamRef.current]) {
      if (source) tracks.push(...source.getTracks())
    }
    if (relayTrackRef.current) tracks.push(relayTrackRef.current)
    return tracks
  }, [])

  const syncLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const present = new Set(pc.getSenders().map((sender) => sender.track?.id).filter(Boolean))
    for (const track of collectLocalTracks()) {
      if (!present.has(track.id)) {
        const source = screenStreamRef.current?.getTracks().includes(track)
          ? screenStreamRef.current
          : localStreamRef.current
        pc.addTrack(track, source ?? new MediaStream([track]))
      }
    }
  }, [collectLocalTracks])

  const removeEndedSenders = useCallback((pc: RTCPeerConnection): boolean => {
    let removed = false
    for (const sender of pc.getSenders()) {
      if (sender.track && sender.track.readyState === 'ended') {
        try {
          pc.removeTrack(sender)
          removed = true
        } catch {

        }
      }
    }
    return removed
  }, [])

  const missingLocalTracks = useCallback(
    (pc: RTCPeerConnection): boolean => {
      const present = new Set(pc.getSenders().map((sender) => sender.track?.id).filter(Boolean))
      return collectLocalTracks().some((track) => !present.has(track.id))
    },
    [collectLocalTracks],
  )

  const hasEndedSenders = useCallback((pc: RTCPeerConnection): boolean => {
    return pc.getSenders().some((sender) => sender.track && sender.track.readyState === 'ended')
  }, [])

  const waitForLocalStream = useCallback(async () => {
    const started = Date.now()
    while (!localStreamRef.current && !mediaBlockedRef.current) {
      if (Date.now() - started > LOCAL_STREAM_WAIT_MS) return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }, [])

  const ensurePeer = useCallback(
    async (peerId: string, mode: EnsureMode = 'auto') => {
      if (!transport || !isHubRef.current) return
      if (offerInFlightRef.current.has(peerId)) return
      offerInFlightRef.current.add(peerId)
      try {
        let pc = pcsRef.current.get(peerId)
        const dead = !pc || pc.connectionState === 'failed' || pc.connectionState === 'closed'
        if (!pc || dead || mode === 'force') {
          if (pc) closePeer(peerId)
          pc = createPeer(peerId)
          epochsRef.current[peerId] = (epochsRef.current[peerId] ?? 0) + 1
        } else if (
          mode === 'auto' &&
          pc.connectionState === 'connected' &&
          !missingLocalTracks(pc) &&
          !hasEndedSenders(pc)
        ) {
          return
        }
        if (pc.signalingState === 'have-local-offer') return
        await waitForLocalStream()
        const fresh = pcsRef.current.get(peerId)
        if (!fresh || fresh !== pc) return
        removeEndedSenders(fresh)
        syncLocalTracks(fresh)
        const epoch = epochsRef.current[peerId] ?? 1
        const offer = await fresh.createOffer()
        await fresh.setLocalDescription(offer)
        await gatherComplete(fresh)
        await sendRef.current(peerId, {
          kind: 'offer',
          description: descriptionOf(fresh.localDescription),
          epoch,
        })
      } catch {
        closePeer(peerId)
      } finally {
        offerInFlightRef.current.delete(peerId)
      }
    },
    [
      transport,
      closePeer,
      createPeer,
      syncLocalTracks,
      waitForLocalStream,
      missingLocalTracks,
      hasEndedSenders,
      removeEndedSenders,
    ],
  )
  ensurePeerRef.current = ensurePeer

  const handleOffer = useCallback(
    async (signal: LiveSignal) => {
      if (answerInFlightRef.current.has(signal.from)) return
      answerInFlightRef.current.add(signal.from)
      try {
        if (signal.epoch > 0) {
          if (isStaleOffer(signal, appliedOfferEpochsRef.current[signal.from] ?? 0)) return
          appliedOfferEpochsRef.current[signal.from] = signal.epoch
        }
        if (!isUsableDescription(signal.description)) return
        await waitForLocalStream()
        let pc = pcsRef.current.get(signal.from)
        if (!pc || pc.signalingState !== 'stable') {
          if (pc) closePeer(signal.from)
          pc = createPeer(signal.from)
        }
        syncLocalTracks(pc)
        await pc.setRemoteDescription(signal.description)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await gatherComplete(pc)
        await sendRef.current(signal.from, {
          kind: 'answer',
          description: descriptionOf(pc.localDescription),
          epoch: signal.epoch,
        })
      } catch {
        closePeer(signal.from)
      } finally {
        answerInFlightRef.current.delete(signal.from)
      }
    },
    [closePeer, createPeer, syncLocalTracks, waitForLocalStream],
  )

  const handleAnswer = useCallback(async (signal: LiveSignal) => {
    const pc = pcsRef.current.get(signal.from)

    if (!pc || pc.signalingState !== 'have-local-offer') return
    if (!isUsableDescription(signal.description)) return
    try {
      await pc.setRemoteDescription(signal.description)
    } catch {
      closePeer(signal.from)
    }
  }, [closePeer])

  const handleSignal = useCallback(
    (signal: LiveSignal) => {
      const relevant = isSignalRelevantForPeer({
        isHost: isHubRef.current,
        from: signal.from,
        hostClientIds: [hubIdRef.current],
      })
      if (!relevant) return
      if (isHubRef.current) {
        if (signal.kind === 'answer') void handleAnswer(signal)
        else if (signal.kind === 'restart') void ensurePeer(signal.from, 'force')
        else if (signal.kind === 'hello') void ensurePeer(signal.from, 'auto')
        else if (signal.kind === 'renegotiate') void ensurePeer(signal.from, 'renegotiate')
        return
      }

      if (signal.from !== hubIdRef.current) return
      if (signal.kind === 'offer') void handleOffer(signal)
    },
    [ensurePeer, handleAnswer, handleOffer],
  )

  const peersExpected = isHub
    ? participants.filter((entry) => entry.clientId !== clientId).length
    : hubClientId.length > 0 && hubClientId !== clientId
      ? 1
      : 0
  const states = Object.values(peerStates)
  const allConnected = states.length > 0 && states.every((state) => state === 'connected')
  const fast = enabled && peersExpected > 0 && !allConnected

  const { send } = useSignalMailbox({ clientId, transport, enabled, fast, onSignal: handleSignal })
  sendRef.current = send

  useEffect(() => {
    if (!enabled || !isHub) return
    const peers = participants.filter((entry) => entry.clientId !== clientId)
    for (const peer of peers) void ensurePeer(peer.clientId)
    for (const peerId of [...pcsRef.current.keys()]) {
      if (!peers.some((peer) => peer.clientId === peerId)) closePeer(peerId)
    }
  }, [participants, enabled, isHub, clientId, ensurePeer, closePeer, localStream])

  useEffect(() => {
    if (!enabled || isHub || !transport || !hubClientId || hubClientId === clientId) return
    const known = pcsRef.current.has(hubClientId)
    const last = helloAtRef.current[hubClientId] ?? 0
    if (known || Date.now() - last < HELLO_THROTTLE_MS) return
    helloAtRef.current[hubClientId] = Date.now()
    void sendRef.current(hubClientId, { kind: 'hello', description: null })
  }, [participants, enabled, isHub, transport, hubClientId, clientId, peerStates])

  const getLastVideoTrack = useCallback((peerId: string): MediaStreamTrack | null => {
    const order = peerVideoOrderRef.current[peerId]
    if (!order || order.length === 0) return null
    return order[order.length - 1] ?? null
  }, [])

  const relayTrack =
    enabled && isHub && screenSharerId && screenSharerId !== clientId
      ? getLastVideoTrack(screenSharerId)
      : null
  relayTrackRef.current = relayTrack

  useEffect(() => {
    if (!enabled || !transport) return
    if (isHub) {
      for (const peerId of [...pcsRef.current.keys()]) void ensurePeer(peerId, 'renegotiate')
    } else if (hubClientId && hubClientId !== clientId) {
      void sendRef.current(hubClientId, { kind: 'renegotiate', description: null })
    }

  }, [enabled, transport, isHub, hubClientId, clientId, screenStream, relayTrack, ensurePeer])

  useEffect(() => {
    const pcs = pcsRef.current
    return () => {
      for (const pc of pcs.values()) {
        try {
          pc.close()
        } catch {

        }
      }
      pcs.clear()
    }
  }, [])

  const restart = useCallback(() => {
    if (isHubRef.current) {
      for (const peerId of [...pcsRef.current.keys()]) void ensurePeer(peerId, 'force')
    } else if (hubIdRef.current) {
      void sendRef.current(hubIdRef.current, { kind: 'restart', description: null })
    }
  }, [ensurePeer])

  const connection = summarizeConnection(states)
  const stats = useTransportStats(pcsRef, enabled)

  return { remoteStreams, peerStates, connection, getLastVideoTrack, stats, restart }
}
