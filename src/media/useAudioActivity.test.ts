import { describe, expect, it } from 'vitest'
import { computeRmsVolume, isSpeakingFromVolume } from './useAudioActivity'

describe('useAudioActivity utilities', () => {
  it('computes 0 volume for an empty buffer', () => {
    const emptyBuffer = new Uint8Array(0)
    expect(computeRmsVolume(emptyBuffer)).toBe(0)
  })

  it('computes 0 volume for silent buffer', () => {
    const silence = new Uint8Array([0, 0, 0, 0, 0])
    expect(computeRmsVolume(silence)).toBe(0)
  })

  it('computes 100 for peak full-scale buffer', () => {
    const peak = new Uint8Array([255, 255, 255, 255])
    expect(computeRmsVolume(peak)).toBe(100)
  })

  it('computes accurate proportional volume for medium levels', () => {
    const medium = new Uint8Array([128, 128, 128, 128])
    const vol = computeRmsVolume(medium)
    expect(vol).toBeGreaterThan(45)
    expect(vol).toBeLessThan(55)
  })

  it('accurately evaluates isSpeaking against threshold', () => {
    expect(isSpeakingFromVolume(5, 15)).toBe(false)
    expect(isSpeakingFromVolume(15, 15)).toBe(true)
    expect(isSpeakingFromVolume(25, 15)).toBe(true)
    expect(isSpeakingFromVolume(10, 20)).toBe(false)
    expect(isSpeakingFromVolume(20, 20)).toBe(true)
  })
})
