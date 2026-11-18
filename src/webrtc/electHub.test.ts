import { describe, expect, it } from 'vitest'
import type { RoomParticipant } from '../core'
import { electHubClientIds } from './usePeerMesh'

const peer = (
  input: Partial<RoomParticipant> & Pick<RoomParticipant, 'clientId'>,
): RoomParticipant => ({
  userId: 'user-1',
  name: 'Peer',
  isHost: false,
  handRaised: false,
  micOn: true,
  camOn: true,
  at: 0,
  ...input,
})

describe('electHubClientIds', () => {
  it('returns an empty list when nobody is present', () => {
    expect(electHubClientIds([])).toEqual([])
  })

  it('returns an empty list when no participant is a host', () => {
    expect(
      electHubClientIds([peer({ clientId: 'guest-a' }), peer({ clientId: 'guest-b' })]),
    ).toEqual([])
  })

  it('elects the single host', () => {
    expect(
      electHubClientIds([peer({ clientId: 'guest-a' }), peer({ clientId: 'host-1', isHost: true })]),
    ).toEqual(['host-1'])
  })

  it('orders multiple hosts lexicographically — first entry is the hub', () => {
    expect(
      electHubClientIds([
        peer({ clientId: 'host-zeta', isHost: true }),
        peer({ clientId: 'host-alpha', isHost: true }),
        peer({ clientId: 'host-mid', isHost: true }),
      ]),
    ).toEqual(['host-alpha', 'host-mid', 'host-zeta'])
  })

  it('excludes guests even when they sort before every host', () => {
    expect(
      electHubClientIds([
        peer({ clientId: 'aaa-guest' }),
        peer({ clientId: 'zzz-host', isHost: true }),
      ]),
    ).toEqual(['zzz-host'])
  })
})
