// Shared validation for live-room file sharing. The server route and the
// upload UI both run these, so the allowlist, size cap and name handling
// live in exactly one place.

/** Mirrors scripts/upload-media.ts CONTENT_TYPES (course material shapes). */
export const LIVE_FILE_CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
}

export const LIVE_FILE_MAX_BYTES = 25 * 1024 * 1024
export const LIVE_FILE_MAX_NAME_CHARS = 100
/** Metadata rows kept on the room's lesson doc. */
export const MAX_ROOM_FILES = 30

export interface LiveRoomFile {
  id: string
  name: string
  ext: string
  size: number
  contentType: string
  uploadedBy: string
  uploaderName: string
  at: number
}

export type LiveFileValidation =
  | { ok: true; ext: string; contentType: string; name: string }
  | { ok: false; error: 'too_large' | 'bad_type' | 'bad_name' }

/** Strips paths, control characters and quotes; caps the length. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]+/g, ' ')
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length === 0) return 'file'
  return cleaned.length > LIVE_FILE_MAX_NAME_CHARS
    ? `${cleaned.slice(0, LIVE_FILE_MAX_NAME_CHARS - 8)}…${cleaned.slice(-7)}`
    : cleaned
}

export function validateLiveFile(rawName: string, size: number): LiveFileValidation {
  if (!Number.isFinite(size) || size <= 0 || size > LIVE_FILE_MAX_BYTES) {
    return { ok: false, error: 'too_large' }
  }
  const dot = rawName.lastIndexOf('.')
  const ext = dot >= 0 ? rawName.slice(dot).toLowerCase() : ''
  const contentType = LIVE_FILE_CONTENT_TYPES[ext]
  if (!contentType) return { ok: false, error: 'bad_type' }
  const name = sanitizeFileName(rawName)
  if (name.length === 0) return { ok: false, error: 'bad_name' }
  return { ok: true, ext, contentType, name }
}

/** R2 object key for a room file — derived, never stored separately. */
export function liveFileKey(roomId: string, fileId: string, ext: string): string {
  return `live/${roomId}/${fileId}${ext}`
}

/** Human-readable byte size for the file list. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
