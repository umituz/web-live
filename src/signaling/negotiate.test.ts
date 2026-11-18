import { describe, expect, it } from 'vitest'
import type { LiveSignal } from './negotiate'
import {
  buildSignalBody,
  isSignalKind,
  isSignalRelevantForPeer,
  isStaleOffer,
  isUsableDescription,
  parseLiveSignal,
  summarizeConnection,
} from './negotiate'

const SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n'

describe('parseLiveSignal', () => {
  it('parses an offer row with an epoch', () => {
    const signal = parseLiveSignal({
      seq: 7,
      from_user: 'live-client-abc',
      body: { kind: 'offer', description: { type: 'offer', sdp: SDP }, epoch: 2 },
    })
    expect(signal).toEqual({
      seq: 7,
      from: 'live-client-abc',
      kind: 'offer',
      description: { type: 'offer', sdp: SDP },
      epoch: 2,
    })
  })

  it('parses control signals without a description', () => {
    expect(parseLiveSignal({ seq: 1, from_user: 'a', body: { kind: 'hello' } })).toMatchObject({
      kind: 'hello',
      epoch: 0,
      description: null,
    })
    expect(parseLiveSignal({ seq: 2, from_user: 'a', body: { kind: 'restart' } })).toMatchObject({
      kind: 'restart',
    })
  })

  it('drops malformed rows', () => {
    expect(parseLiveSignal(null)).toBeNull()
    expect(parseLiveSignal({})).toBeNull()
    expect(parseLiveSignal({ seq: 1, from_user: '', body: { kind: 'offer' } })).toBeNull()

    expect(parseLiveSignal({ seq: 1, from_user: 'a', body: { kind: 'offer' } })).toBeNull()
    expect(
      parseLiveSignal({ seq: 1, from_user: 'a', body: { kind: 'answer', description: { type: 'answer' } } }),
    ).toBeNull()
    expect(parseLiveSignal({ seq: 1, from_user: 'a', body: { kind: 'nonsense' } })).toBeNull()
  })
})

describe('isStaleOffer', () => {
  it('rejects offers at or below the applied epoch and accepts newer ones', () => {
    const offer = (epoch: number): LiveSignal => ({
      seq: 1,
      from: 'hub',
      kind: 'offer',
      description: { type: 'offer', sdp: SDP },
      epoch,
    })
    expect(isStaleOffer(offer(2), 2)).toBe(true)
    expect(isStaleOffer(offer(1), 2)).toBe(true)
    expect(isStaleOffer(offer(3), 2)).toBe(false)
  })

  it('treats epoch-less offers as never stale', () => {
    const legacy = { seq: 1, from: 'hub', kind: 'offer' as const, description: { type: 'offer', sdp: SDP }, epoch: 0 }
    expect(isStaleOffer(legacy, 5)).toBe(false)
  })
})

describe('buildSignalBody', () => {
  it('serializes kind, description and epoch', () => {
    const { body, ok } = buildSignalBody({
      kind: 'offer',
      description: { type: 'offer', sdp: SDP },
      epoch: 4,
    })
    expect(ok).toBe(true)
    expect(JSON.parse(body)).toEqual({ kind: 'offer', description: { type: 'offer', sdp: SDP }, epoch: 4 })
  })

  it('flags oversized bodies', () => {
    const huge = 'x'.repeat(20_000)
    const { body, ok } = buildSignalBody({ kind: 'offer', description: { type: 'offer', sdp: huge }, epoch: 1 })
    expect(ok).toBe(false)
    expect(body.length).toBeGreaterThan(16_384)
  })
})

describe('isUsableDescription', () => {
  it('accepts offer/answer types with SDP, rejects everything else', () => {
    expect(isUsableDescription({ type: 'offer', sdp: SDP })).toBe(true)
    expect(isUsableDescription({ type: 'answer', sdp: SDP })).toBe(true)
    expect(isUsableDescription({ type: 'pranswer', sdp: SDP })).toBe(false)
    expect(isUsableDescription({ type: 'offer', sdp: '' })).toBe(false)
    expect(isUsableDescription(null)).toBe(false)
  })
})

describe('isSignalRelevantForPeer', () => {
  it('hub takes everything; guests only listen to the hub', () => {
    expect(isSignalRelevantForPeer({ isHost: true, from: 'anyone', hostClientIds: ['hub'] })).toBe(true)
    expect(isSignalRelevantForPeer({ isHost: false, from: 'hub', hostClientIds: ['hub'] })).toBe(true)
    expect(isSignalRelevantForPeer({ isHost: false, from: 'other-guest', hostClientIds: ['hub'] })).toBe(false)
    expect(isSignalRelevantForPeer({ isHost: false, from: 'anyone', hostClientIds: [] })).toBe(false)
  })
})

describe('summarizeConnection', () => {
  it('empty means idle', () => {
    expect(summarizeConnection([])).toBe('idle')
  })

  it('any pending peer keeps the room connecting', () => {
    expect(summarizeConnection(['connected', 'connecting'])).toBe('connecting')
    expect(summarizeConnection(['new'])).toBe('connecting')
  })

  it('all connected is the only fully connected state', () => {
    expect(summarizeConnection(['connected'])).toBe('connected')
    expect(summarizeConnection(['connected', 'connected'])).toBe('connected')
  })

  it('mixed connected/disconnected is unstable', () => {
    expect(summarizeConnection(['connected', 'disconnected'])).toBe('unstable')
    expect(summarizeConnection(['disconnected'])).toBe('unstable')
  })

  it('no live peers at all is failed', () => {
    expect(summarizeConnection(['failed'])).toBe('failed')
    expect(summarizeConnection(['closed', 'failed'])).toBe('failed')
  })
})

describe('isSignalKind', () => {
  it('accepts the four known kinds only', () => {
    for (const kind of ['offer', 'answer', 'restart', 'hello']) {
      expect(isSignalKind(kind)).toBe(true)
    }
    expect(isSignalKind('candidate')).toBe(false)
    expect(isSignalKind(42)).toBe(false)
  })
})
