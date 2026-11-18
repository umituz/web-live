import { describe, expect, it } from 'vitest'
import { canTransition, RECORDER_TRANSITIONS, transitionGraphIsClosed } from './voiceRecorder'

describe('recorder status law', () => {
  it('is a closed graph', () => {
    expect(transitionGraphIsClosed(RECORDER_TRANSITIONS)).toBe(true)
  })

  it('starts recording from idle, denied or downloaded but never from unsupported', () => {
    expect(canTransition(RECORDER_TRANSITIONS, 'idle', 'recording')).toBe(true)
    expect(canTransition(RECORDER_TRANSITIONS, 'denied', 'recording')).toBe(true)
    expect(canTransition(RECORDER_TRANSITIONS, 'downloaded', 'recording')).toBe(true)
    expect(canTransition(RECORDER_TRANSITIONS, 'unsupported', 'recording')).toBe(false)
  })

  it('stops before the file downloads — never jumps recording to downloaded', () => {
    expect(canTransition(RECORDER_TRANSITIONS, 'recording', 'stopped')).toBe(true)
    expect(canTransition(RECORDER_TRANSITIONS, 'recording', 'downloaded')).toBe(false)
    expect(canTransition(RECORDER_TRANSITIONS, 'stopped', 'downloaded')).toBe(true)
  })

  it('releases back to idle from every state', () => {
    for (const status of Object.keys(RECORDER_TRANSITIONS)) {
      expect(canTransition(RECORDER_TRANSITIONS, status, 'idle')).toBe(true)
    }
  })
})
