/**
 * Pure helpers for host-side composite recording. The hook
 * (useCompositeRecorder) owns the browser plumbing; everything testable
 * without a MediaRecorder lives here: mime negotiation, part metadata
 * parsing and URL building.
 *
 * A recording is a sequence of INDEPENDENT ~2 minute webm/mp4 segments
 * ("parts"). MediaRecorder timeslice chunks are EBML fragments that cannot
 * play standalone, so the hook runs full start/stop cycles per part instead —
 * every uploaded object is a complete, seekable file.
 */

export const RECORDING_SEGMENT_MS = 120_000;
/** 12h of material at one part / 2 min — the server rejects beyond this. */
export const RECORDING_MAX_PARTS = 360;
export const RECORDING_PART_MAX_BYTES = 30 * 1024 * 1024;
export const RECORDING_WIDTH = 1280;
export const RECORDING_HEIGHT = 720;
export const RECORDING_VIDEO_BITRATE = 1_000_000;
export const RECORDING_AUDIO_BITRATE = 64_000;

/** Ordered by preference: vp8 encodes fast, mp4 is the Safari fallback. */
const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
  'video/mp4',
] as const;

/** Picks the first container the engine can actually encode; null = no recording. */
export function pickRecordingMimeType(
  isTypeSupported: (mime: string) => boolean,
): string | null {
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (isTypeSupported(mime)) return mime;
  }
  return null;
}

/** File extension for a recording mime type ('' for unknown — reject). */
export function recordingExt(mimeType: string): '.webm' | '.mp4' | '' {
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('mp4')) return '.mp4';
  return '';
}

export interface RecordingPartMeta {
  n: number;
  size: number;
  at: number;
}

export interface CompositeRecording {
  id: string;
  startedAt: number;
  endedAt: number | null;
  byName: string;
  parts: RecordingPartMeta[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePart(value: unknown): RecordingPartMeta | null {
  if (!isRecord(value)) return null;
  const n = value.n;
  const size = value.size;
  const at = value.at;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > RECORDING_MAX_PARTS) return null;
  if (typeof size !== 'number' || size <= 0 || size > RECORDING_PART_MAX_BYTES) return null;
  return { n, size, at: typeof at === 'number' ? at : 0 };
}

/** Tolerant parse of one recording entry off the room doc. */
export function parseCompositeRecording(value: unknown): CompositeRecording | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  return {
    id: value.id,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : 0,
    endedAt: typeof value.endedAt === 'number' ? value.endedAt : null,
    byName: typeof value.byName === 'string' ? value.byName : '',
    parts: Array.isArray(value.parts)
      ? value.parts.map(parsePart).filter((part): part is RecordingPartMeta => part !== null)
      : [],
  };
}

export function parseCompositeRecordings(value: unknown): CompositeRecording[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseCompositeRecording).filter((rec): rec is CompositeRecording => rec !== null);
}

/** Total wall-clock length of a recording (finished or still running). */
export function recordingSeconds(recording: CompositeRecording, nowMs = Date.now()): number {
  const end = recording.endedAt ?? nowMs;
  const span = Math.max(0, Math.floor((end - recording.startedAt) / 1000));
  // While live, the wall clock is the truth; once finished round to the
  // nearest part boundary at most (the last part always exists).
  if (recording.endedAt === null) return span;
  return Math.max(span, 1);
}

/**
 * Playback URL for one part. `pathRoot` is the app's own route prefix with
 * every gating context already baked in — e.g. `/api/live-room/{roomId}/recording`
 * while the room lives, or `/api/bookings/{bookingId}/recordings` for closed
 * booking history — because THE APP OWNS PLAYBACK GATING: the route this
 * points at must re-check access (room membership, booking participation)
 * before serving any bytes. This builder is a plain string joiner by design.
 * `ext` (from recordingExt) lets the server answer a content type without
 * sniffing; pass '' for an extension-less route shape.
 */
export function recordingPartUrl(input: {
  pathRoot: string;
  recordingId: string;
  part: number;
  ext: string;
}): string {
  return `${input.pathRoot}/${input.recordingId}/parts/${input.part}${input.ext}`;
}
