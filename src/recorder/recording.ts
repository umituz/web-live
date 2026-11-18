export const RECORDING_SEGMENT_MS = 120_000;

export const RECORDING_MAX_PARTS = 360;
export const RECORDING_PART_MAX_BYTES = 30 * 1024 * 1024;
export const RECORDING_WIDTH = 1280;
export const RECORDING_HEIGHT = 720;
export const RECORDING_VIDEO_BITRATE = 1_000_000;
export const RECORDING_AUDIO_BITRATE = 64_000;

const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
  'video/mp4',
] as const;

export function pickRecordingMimeType(
  isTypeSupported: (mime: string) => boolean,
): string | null {
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (isTypeSupported(mime)) return mime;
  }
  return null;
}

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

export function recordingSeconds(recording: CompositeRecording, nowMs = Date.now()): number {
  const end = recording.endedAt ?? nowMs;
  const span = Math.max(0, Math.floor((end - recording.startedAt) / 1000));

  if (recording.endedAt === null) return span;
  return Math.max(span, 1);
}

export function recordingPartUrl(input: {
  pathRoot: string;
  recordingId: string;
  part: number;
  ext: string;
}): string {
  return `${input.pathRoot}/${input.recordingId}/parts/${input.part}${input.ext}`;
}
