import { describe, expect, it } from 'vitest'
import { filterDevicesByKind } from './useMediaDevices'

describe('filterDevicesByKind', () => {
  const mockDevices = [
    {
      deviceId: 'mic-1',
      kind: 'audioinput',
      label: 'Built-in Microphone',
      groupId: 'group-1',
      toJSON: () => ({}),
    },
    {
      deviceId: 'mic-2',
      kind: 'audioinput',
      label: '',
      groupId: 'group-2',
      toJSON: () => ({}),
    },
    {
      deviceId: 'cam-1',
      kind: 'videoinput',
      label: 'FaceTime HD Camera',
      groupId: 'group-1',
      toJSON: () => ({}),
    },
    {
      deviceId: 'spk-1',
      kind: 'audiooutput',
      label: 'Built-in Speaker',
      groupId: 'group-1',
      toJSON: () => ({}),
    },
  ] as MediaDeviceInfo[]

  it('filters audio inputs and formats label fallback', () => {
    const audioInputs = filterDevicesByKind(mockDevices, 'audioinput')
    expect(audioInputs).toHaveLength(2)
    expect(audioInputs[0]).toEqual({
      deviceId: 'mic-1',
      label: 'Built-in Microphone',
      groupId: 'group-1',
    })
    expect(audioInputs[1]).toEqual({
      deviceId: 'mic-2',
      label: 'audioinput (mic-2)',
      groupId: 'group-2',
    })
  })

  it('filters video inputs accurately', () => {
    const videoInputs = filterDevicesByKind(mockDevices, 'videoinput')
    expect(videoInputs).toHaveLength(1)
    expect(videoInputs[0]?.label).toBe('FaceTime HD Camera')
  })

  it('filters audio outputs accurately', () => {
    const audioOutputs = filterDevicesByKind(mockDevices, 'audiooutput')
    expect(audioOutputs).toHaveLength(1)
    expect(audioOutputs[0]?.deviceId).toBe('spk-1')
  })

  it('returns empty array when kind matches nothing', () => {
    const empty = filterDevicesByKind([], 'audioinput')
    expect(empty).toEqual([])
  })
})
