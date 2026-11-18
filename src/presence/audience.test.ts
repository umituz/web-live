import { describe, expect, it } from 'vitest'
import { createHttpAudienceTransport, parseAudienceMembers } from './audience'
import type { JsonRequest } from '../core'

describe('parseAudienceMembers', () => {
  it('keeps entries with a non-empty clientId and drops the rest', () => {
    const members = parseAudienceMembers([
      { clientId: 'a', userId: 'u1', name: 'Ada', at: 1 },
      { clientId: '', userId: 'u2', name: 'Empty', at: 2 },
      { clientId: 7 },
      'noise',
      null,
    ])
    expect(members).toEqual([{ clientId: 'a', userId: 'u1', name: 'Ada', at: 1 }])
  })

  it('reads object-keyed rosters', () => {
    const members = parseAudienceMembers({
      a: { clientId: 'a', userId: '', name: '', at: 3 },
      b: { userId: 'u' },
    })
    expect(members).toEqual([{ clientId: 'a', userId: '', name: '', at: 3 }])
  })

  it('returns an empty roster for non-collection input', () => {
    expect(parseAudienceMembers(undefined)).toEqual([])
    expect(parseAudienceMembers('nope')).toEqual([])
    expect(parseAudienceMembers(42)).toEqual([])
  })
})

describe('createHttpAudienceTransport', () => {
  it('PUTs the beat to the room beatUrl and returns the roster envelope', async () => {
    const calls: Array<{ url: string; init: { method: string; json?: unknown } }> = []
    const request: JsonRequest = async (url, init) => {
      calls.push({ url, init })
      return { members: [{ clientId: 'a', userId: '', name: '', at: 1 }] } as never
    }
    const transport = createHttpAudienceTransport({
      roomId: 'stm_1',
      urls: { beatUrl: (id) => `/api/streams/${id}/audience` },
      request,
    })

    const res = await transport.beat({ clientId: 'cl_1', userId: 'u_1', name: 'Ada' })

    expect(calls).toEqual([
      {
        url: '/api/streams/stm_1/audience',
        init: { method: 'PUT', json: { clientId: 'cl_1', userId: 'u_1', name: 'Ada' } },
      },
    ])
    expect(res).toEqual({ members: [{ clientId: 'a', userId: '', name: '', at: 1 }] })
  })

  it('sends the beat without optional identity fields for anonymous viewers', async () => {
    const calls: Array<{ url: string; init: { method: string; json?: unknown } }> = []
    const transport = createHttpAudienceTransport({
      roomId: 'stm_1',
      urls: { beatUrl: (id) => `/api/streams/${id}/audience` },
      request: async (url, init) => {
        calls.push({ url, init })
        return {} as never
      },
    })

    const res = await transport.beat({ clientId: 'cl_2' })

    expect(calls[0]?.init.json).toEqual({ clientId: 'cl_2' })
    expect(res).toEqual({})
  })
})
