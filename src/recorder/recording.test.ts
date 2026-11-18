import { describe, expect, it } from 'vitest'
import {
  RECORDING_MAX_PARTS,
  RECORDING_PART_MAX_BYTES,
  parseCompositeRecording,
  parseCompositeRecordings,
  pickRecordingMimeType,
  recordingExt,
  recordingPartUrl,
  recordingSeconds,
} from './recording'

describe('pickRecordingMimeType', () => {
  it('prefers vp8 webm when supported', () => {
    expect(pickRecordingMimeType(() => true)).toBe('video/webm;codecs=vp8,opus')
  })

  it('falls through candidates in order', () => {
    expect(
      pickRecordingMimeType((mime) => mime === 'video/mp4'),
    ).toBe('video/mp4')
    expect(
      pickRecordingMimeType((mime) => mime === 'video/webm'),
    ).toBe('video/webm')
  })

  it('returns null when nothing is encodable', () => {
    expect(pickRecordingMimeType(() => false)).toBeNull()
  })
})

describe('recordingExt', () => {
  it('maps mime types to extensions', () => {
    expect(recordingExt('video/webm;codecs=vp8,opus')).toBe('.webm')
    expect(recordingExt('video/mp4')).toBe('.mp4')
    expect(recordingExt('audio/ogg')).toBe('')
  })
})

describe('parseCompositeRecording', () => {
  it('parses a stored recording with parts', () => {
    const rec = parseCompositeRecording({
      id: 'rec-1',
      startedAt: 1000,
      endedAt: 61_000,
      byName: 'Tutor',
      parts: [{ n: 1, size: 500, at: 2000, contentType: 'video/webm' }],
    })
    expect(rec).not.toBeNull()
    expect(rec?.parts).toHaveLength(1)
    expect(rec?.endedAt).toBe(61_000)
  })

  it('drops malformed entries and out-of-bound parts', () => {
    expect(parseCompositeRecording('nope')).toBeNull()
    expect(parseCompositeRecording({ parts: [] })).toBeNull() // no id
    const rec = parseCompositeRecording({
      id: 'rec-2',
      startedAt: 0,
      parts: [
        { n: 0, size: 10, at: 0, contentType: 'video/webm' }, // n below 1
        { n: RECORDING_MAX_PARTS + 1, size: 10, at: 0, contentType: 'video/webm' },
        { n: 2, size: RECORDING_PART_MAX_BYTES + 1, at: 0, contentType: 'video/webm' },
        { n: 3, size: -1, at: 0, contentType: 'video/webm' },
        { n: 4, size: 12, at: 0, contentType: 'video/webm' }, // valid
      ],
    })
    expect(rec?.parts).toEqual([{ n: 4, size: 12, at: 0 }])
  })

  it('parses arrays and drops garbage wholesale', () => {
    const list = parseCompositeRecordings([{ id: 'a' }, null, { id: 'b', parts: [] }])
    expect(list.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(parseCompositeRecordings(undefined)).toEqual([])
  })
})

describe('recordingSeconds', () => {
  it('uses wall clock while live', () => {
    expect(recordingSeconds({ id: 'a', startedAt: 0, endedAt: null, byName: '', parts: [] }, 90_000)).toBe(90)
  })

  it('uses the stored end once finished', () => {
    expect(recordingSeconds({ id: 'a', startedAt: 0, endedAt: 60_000, byName: '', parts: [] }, 9_000_000)).toBe(60)
  })
})

describe('recordingPartUrl', () => {
  it('joins the app route prefix, part and extension', () => {
    expect(
      recordingPartUrl({
        pathRoot: '/api/tutoring/live-room/bk-1/recording',
        recordingId: 'rec-1',
        part: 2,
        ext: '.webm',
      }),
    ).toBe('/api/tutoring/live-room/bk-1/recording/rec-1/parts/2.webm')
  })

  it('serves booking-history gating through the same builder (ext-less)', () => {
    expect(
      recordingPartUrl({
        pathRoot: '/api/tutoring/bookings/bk-1/recordings',
        recordingId: 'rec-1',
        part: 2,
        ext: '',
      }),
    ).toBe('/api/tutoring/bookings/bk-1/recordings/rec-1/parts/2')
  })
})
