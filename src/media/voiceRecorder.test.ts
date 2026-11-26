import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { canTransition, RECORDER_TRANSITIONS, transitionGraphIsClosed, useVoiceRecorder } from './voiceRecorder'

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

function StateProbe() {
  const state = useVoiceRecorder()
  return createElement(
    'pre',
    null,
    JSON.stringify({ status: state.status, recording: state.recording, stream: state.stream }),
  )
}

describe('useVoiceRecorder initial state', () => {
  it('exposes stream alongside status and recording, null before recording starts', () => {
    const html = renderToString(createElement(StateProbe))
    expect(html).toContain('&quot;status&quot;:&quot;idle&quot;')
    expect(html).toContain('&quot;recording&quot;:false')
    expect(html).toContain('&quot;stream&quot;:null')
  })
})
