// Pure WebRTC negotiation helpers — no DOM, no RTCPeerConnection, fully
// testable. The imperative pc wiring lives in useWebRtc.

export type SignalKind = 'offer' | 'answer' | 'restart' | 'hello' | 'renegotiate';

/** A signal as it travels over the mailbox API. */
export type LiveSignal = {
  seq: number;
  from: string;
  kind: SignalKind;
  /** Session description (`{type, sdp}`) for offer/answer; absent for restart. */
  description: { type: string; sdp: string } | null;
  /** Hub-side generation counter: offers with a stale epoch are dropped. */
  epoch: number;
};

export const SIGNAL_BODY_MAX_CHARS = 16_384;

const KINDS: readonly SignalKind[] = ['offer', 'answer', 'restart', 'hello', 'renegotiate'];

export function isSignalKind(value: unknown): value is SignalKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isDescription(value: unknown): value is { type: string; sdp: string } {
  if (typeof value !== 'object' || value === null) return false;
  const desc = value as Record<string, unknown>;
  return typeof desc.type === 'string' && typeof desc.sdp === 'string' && desc.sdp.length > 0;
}

/**
 * Parses one consume-response row (`{seq, from_user, body}`) into a typed
 * signal. Anything malformed (missing kind, offer without an SDP, garbage)
 * returns null so the caller can drop it instead of blowing up the loop.
 */
export function parseLiveSignal(row: unknown): LiveSignal | null {
  if (typeof row !== 'object' || row === null) return null;
  const raw = row as Record<string, unknown>;
  const body = (typeof raw.body === 'object' && raw.body !== null ? raw.body : {}) as Record<string, unknown>;
  const kind = body.kind;
  if (!isSignalKind(kind)) return null;
  const from = typeof raw.from_user === 'string' ? raw.from_user : '';
  const seq = typeof raw.seq === 'number' ? raw.seq : Number(raw.seq);
  if (from.length === 0 || !Number.isFinite(seq)) return null;
  const description = isDescription(body.description) ? body.description : null;
  if ((kind === 'offer' || kind === 'answer') && !description) return null;
  const epoch = typeof body.epoch === 'number' && Number.isFinite(body.epoch) ? body.epoch : 0;
  return { seq, from, kind, description, epoch };
}

/** Whether a description payload is usable as a remote description. */
export function isUsableDescription(
  description: LiveSignal['description'],
): description is { type: 'offer' | 'answer'; sdp: string } {
  return (
    description !== null &&
    (description.type === 'offer' || description.type === 'answer') &&
    typeof description.sdp === 'string' &&
    description.sdp.length > 0
  );
}

export type WirePayload = {
  kind: SignalKind;
  description: LiveSignal['description'];
  epoch?: number;
};

/** Serializes a signal for POST /signal; guards the mailbox body cap. */
export function buildSignalBody(signal: WirePayload): { body: string; ok: boolean } {
  const payload: Record<string, unknown> = { kind: signal.kind };
  if (signal.description) payload.description = signal.description;
  if (typeof signal.epoch === 'number') payload.epoch = signal.epoch;
  const body = JSON.stringify(payload);
  return { body, ok: body.length <= SIGNAL_BODY_MAX_CHARS };
}

/** A pending offer is stale once a newer epoch has already been applied. */
export function isStaleOffer(signal: LiveSignal, lastAppliedEpoch: number): boolean {
  return signal.kind === 'offer' && signal.epoch > 0 && signal.epoch <= lastAppliedEpoch;
}

/** Sums peer states into one badge value for the room header. */
export type PeerState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export type RoomConnection = 'idle' | 'connecting' | 'connected' | 'unstable' | 'failed';

export function summarizeConnection(states: readonly PeerState[]): RoomConnection {
  if (states.length === 0) return 'idle';
  let connecting = 0;
  let connected = 0;
  let unstable = 0;
  for (const state of states) {
    if (state === 'connected') connected += 1;
    else if (state === 'connecting' || state === 'new') connecting += 1;
    else if (state === 'disconnected') unstable += 1;
    // 'failed'/'closed' are terminal — they only matter through absence.
  }
  if (connecting > 0) return 'connecting';
  if (connected === states.length) return 'connected';
  if (connected > 0) return 'unstable';
  if (unstable > 0) return 'unstable';
  return 'failed';
}

/** Star topology: guests only ever talk to the host. */
export function isSignalRelevantForPeer(input: {
  isHost: boolean;
  from: string;
  hostClientIds: readonly string[];
}): boolean {
  if (input.isHost) return true;
  return input.hostClientIds.includes(input.from);
}
