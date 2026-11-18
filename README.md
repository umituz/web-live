# @umituz/web-live

Live rooms for web apps — polling-based signaling, a WebRTC peer mesh, a
presence roster, room-document sync, local media control and segmented
composite recording. **Transport-agnostic by construction**: every network
touchpoint is a small adapter interface, so the same room runtime runs over
any REST backend (no WebSocket server, no TURN infrastructure required).

Extracted from production code powering Hangora's lesson rooms and community
voice rooms, and shaped to also host Aria's one-to-many broadcast chat.

## Design philosophy

The package owns the **mechanics** of live rooms — mesh negotiation,
heartbeat cadences, optimistic write queues, media pipelines, part-cycle
recording. Your app owns **identity, authorization and storage** — it binds
URL plans and request functions to the adapters and keeps its own auth,
billing and product rules.

| Package provides | Consumer provides |
|---|---|
| Mailbox polling loop (1s handshake / 4s steady / 8s hidden floor) | `SignalTransport` — atomic per-client claim endpoints |
| Star-topology mesh (hub election, epoch-guarded offers, non-trickle ICE, screen-share renegotiation, hub relay) | ICE servers (STUN/TURN list) |
| Presence heartbeat (8s beat, roster parsing, 409 room-full) | `PresenceTransport` — slot PUT returning the roster |
| Audience presence (8s beat while visible, hidden tabs drop out via server TTL, roster + count) | `AudienceTransport` — beat PUT returning the roster |
| Room-doc sync (4s/8s adaptive poll, 30s backoff, optimistic chat with retry+rollback, debounced notes with edit-lock) | `RoomDocTransport` — six REST endpoints |
| Composite recorder (canvas composite + full-room audio mix, 120s standalone parts, retry chain, sendBeacon finish on pagehide) | `RecorderEndpoints` — start/part/finish + beacon URL |
| Local media (single-acquisition mic/cam with in-place toggles, screen share) | nothing — pure browser APIs |

No package dependency on any HTTP client, state library, design system or
i18n — React is an optional peer; every non-hook module is pure and testable
in Node.

## Installation

```bash
npm install @umituz/web-live
```

## Quick start

```tsx
import {
  usePresence,
  usePeerMesh,
  createHttpSignalTransport,
  createHttpPresenceTransport,
} from '@umituz/web-live'
import { apiFetch } from '@umituz/web-hono/client'

const roomId = 'room_123'
const clientId = uniqueId('live-client')

// Bind the mailbox to your backend once per room
const signalTransport = createHttpSignalTransport({
  roomId,
  urls: {
    sendUrl: (id) => `/api/live-room/${id}/signal`,
    consumeUrl: (id) => `/api/live-room/${id}/signals/consume`,
  },
  request: apiFetch,
})

// Same pattern: the presence heartbeat bound to your slot endpoint
const presenceTransport = createHttpPresenceTransport({
  roomId,
  urls: { beatUrl: (id) => `/api/live-room/${id}/presence` },
  request: apiFetch,
})

const presence = usePresence({
  clientId,
  enabled: true,
  micOn: false,
  camOn: false,
  transport: presenceTransport,
})

const mesh = usePeerMesh({
  clientId,
  transport: signalTransport,
  enabled: true,
  localStream: null,
  mediaBlocked: false,
  screenStream: null,
  screenSharerId: null,
  participants: presence.participants,
})
```

The mesh elects a hub (lexicographically-first host client id), the hub
offers to everyone, guests answer and stay dark — a guest's screen share is
relayed by the hub, so every room stays a star with at most N-1 peer
connections per participant.

## Modules

| Subpath | Contents |
|---|---|
| `@umituz/web-live/core` | Wire constants (beats, TTLs, caps), room contract types, defensive doc parsers |
| `@umituz/web-live/signaling` | `negotiate` pure wire protocol (offer/answer/hello/renegotiate, epoch staleness), `SignalTransport` + HTTP factory, `useSignalMailbox` |
| `@umituz/web-live/webrtc` | `usePeerMesh` (star-topology engine), `useTransportStats` (quality badge from getStats) |
| `@umituz/web-live/presence` | `usePresence` heartbeat roster, `PresenceTransport` + HTTP factory |
| `@umituz/web-live/room` | `useRoomDoc` (chat/notes/slides/reactions/screen-slot sync), whiteboard op reducer, room-file validation, caption batcher, broadcast chat feed window |
| `@umituz/web-live/media` | `useRoomMedia` (single-acquisition mic/cam/screen), `useVoiceRecorder` |
| `@umituz/web-live/recorder` | `recording` codec/mime helpers, `useCompositeRecorder` (canvas + audio-mix, 120s parts, pagehide beacon) |
| `@umituz/web-live/hooks` | `useVisiblePolling` — visibility-adaptive interval (zero cost in hidden tabs, catch-up tick on focus) |

## Server contract

Any backend can host the transports if it honors four rules:

1. **Mailbox atomicity** — a consume call claims (and removes) exactly the
   rows addressed to that client; envelopes older than `SIGNAL_TTL_MS`
   (300s) are swept. Body cap `SIGNAL_BODY_MAX_CHARS` (16 KB).
2. **Presence TTL** — the server stamps `at`; slots silent for
   `PRESENCE_TTL_MS` (25s) are pruned. No leave message exists by design.
   Capacity violations answer HTTP 409.
3. **Doc ownership** — the server mints ids and timestamps for chat lines,
   reactions and recordings; clients never invent them (optimistic writes
   reconcile against the next poll).
4. **Idempotent recording finish** — both the graceful path and the
   `sendBeacon` pagehide path may land, in any order.

## Recording model

`useCompositeRecorder` composites the active video onto an offscreen canvas
(10 fps, letterboxed) while an AudioContext mixes every track in the room —
so nobody re-records their own echo. MediaRecorder runs **full start/stop
cycles per ~120s**: timeslice chunks are EBML fragments that cannot play
standalone, while every stopped blob is a complete file. Parts upload
sequentially with a retry chain; closing the tab mid-recording fires a
`sendBeacon` finish so the room's consent flag never strands.

## What stays in your app

Authorization (who may join/host/record), booking and billing rules, room
lobbies and discovery, AI features riding on top (transcripts, coaching,
reports), UI chrome. The package is headless by design — it pairs with any
design system.

## Testing

Pure protocol logic (negotiation, board ops, feed windows, codec picking,
transition graphs) is unit-tested in Node; hooks stay thin so their seams
are exercised by integration in the consuming app.

## License

MIT
