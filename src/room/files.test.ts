import { describe, expect, it } from 'vitest'
import {
  LIVE_FILE_CONTENT_TYPES,
  LIVE_FILE_MAX_BYTES,
  formatFileSize,
  liveFileKey,
  sanitizeFileName,
  validateLiveFile,
} from './files'

describe('validateLiveFile', () => {
  it('accepts allowlisted types with size in range', () => {
    const ok = validateLiveFile('ders-notlari.pdf', 1024)
    expect(ok).toEqual({
      ok: true,
      ext: '.pdf',
      contentType: 'application/pdf',
      name: 'ders-notlari.pdf',
    })
    const png = validateLiveFile('IMG.PNG', 5)
    expect(png.ok && png.contentType).toBe('image/png')
  })

  it('rejects oversized files and non-allowlisted extensions', () => {
    expect(validateLiveFile('big.pdf', LIVE_FILE_MAX_BYTES + 1)).toEqual({ ok: false, error: 'too_large' })
    expect(validateLiveFile('weird.exe', 10)).toEqual({ ok: false, error: 'bad_type' })
    expect(validateLiveFile('noext', 10)).toEqual({ ok: false, error: 'bad_type' })
  })
})

describe('sanitizeFileName', () => {
  it('strips paths, control chars and quotes', () => {
    expect(sanitizeFileName('/etc/passwd')).toBe('passwd')
    expect(sanitizeFileName('C:\\Users\\umit\\plan.pdf')).toBe('plan.pdf')
    // Each forbidden char becomes a space; dangerous bytes never survive.
    expect(sanitizeFileName('a<b>c:"d"|e?f*.txt')).toBe('a b c d e f .txt')
  })

  it('caps length while keeping the tail identifiable and never returns empty', () => {
    const long = 'x'.repeat(300) + '.pdf'
    const sanitized = sanitizeFileName(long)
    expect(sanitized.length).toBeLessThanOrEqual(100)
    expect(sanitized.endsWith('.pdf')).toBe(true)
    expect(sanitizeFileName('')).toBe('file')
    expect(sanitizeFileName('///')).toBe('file')
  })
})

describe('liveFileKey + formatFileSize', () => {
  it('builds a namespaced, derived key', () => {
    expect(liveFileKey('bk-1', 'f-2', '.pdf')).toBe('live/bk-1/f-2.pdf')
  })

  it('formats sizes for the list UI', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('keeps the allowlist aligned with course-material types', () => {
    expect(LIVE_FILE_CONTENT_TYPES['.pdf']).toBe('application/pdf')
    expect(LIVE_FILE_CONTENT_TYPES['.exe']).toBeUndefined()
    expect(Object.keys(LIVE_FILE_CONTENT_TYPES).every((ext) => ext.startsWith('.'))).toBe(true)
  })
})
