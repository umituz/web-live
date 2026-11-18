import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'recording' | 'unsupported' | 'denied' | 'downloaded' | 'stopped'

/**
 * Status-graph shape. Inlined (mirroring the workflow helpers of
 * @umituz/web-hono) so this package carries zero app dependencies.
 */
export type TransitionGraph = Readonly<Record<string, readonly string[]>>

/**
 * Recorder lifecycle: idle starts a recording or fails into unsupported/denied,
 * recording stops into stopped, the finished file downloads as downloaded, and
 * every state releases back to idle. Guards use the transition helpers below
 * so no call site can drive the recorder into an impossible state.
 */
export const RECORDER_TRANSITIONS = {
  idle: ['recording', 'unsupported', 'denied'],
  recording: ['stopped', 'idle'],
  stopped: ['downloaded', 'idle', 'recording'],
  downloaded: ['idle', 'recording'],
  unsupported: ['idle'],
  denied: ['recording', 'idle'],
} as const satisfies TransitionGraph

/** Self-transitions are always legal; anything else must be an edge in the graph. */
export function canTransition(graph: TransitionGraph, from: string, to: string): boolean {
  return from === to || (graph[from] ?? []).includes(to)
}

/** Closed means every named target is itself a state — no dangling edges. */
export function transitionGraphIsClosed(graph: TransitionGraph): boolean {
  const keys = new Set(Object.keys(graph))
  return Object.values(graph).every((targets) => targets.every((target) => keys.has(target)))
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function extensionOf(mimeType: string): string {
  return mimeType.includes('mp4') ? 'm4a' : 'webm'
}

export interface VoiceRecorderState {
  status: RecorderStatus
  recording: boolean
  /** Starts a capture or stops the running one; resolves true iff one started. */
  toggle: () => Promise<boolean>
  /** Stops the running capture, keeping the onstop download handler alive. */
  stop: () => void
}

/**
 * Voice recorder that hands the capture to the learner as a file: stopping the
 * recording assembles the chunks, stops the mic tracks and triggers a browser
 * download, so no upload path is needed. Unmounting releases the stream
 * without downloading (the attempt is abandoned, not finished).
 */
export function useVoiceRecorder(
  {
    /** Base filename (extension appended) for the downloaded recording. */
    downloadName = 'speaking-attempt',
  }: {
    downloadName?: string
  } = {},
): VoiceRecorderState {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const startingRef = useRef(false)

  const transition = useCallback((next: RecorderStatus) => {
    setStatus((prev) => (canTransition(RECORDER_TRANSITIONS, prev, next) ? next : prev))
  }, [])

  const stop = useCallback(() => {
    const recorder = mediaRef.current
    mediaRef.current = null
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
    transition('stopped')
  }, [transition])

  const release = useCallback(() => {
    const recorder = mediaRef.current
    if (!recorder) return
    mediaRef.current = null
    recorder.onstop = null
    if (recorder.state !== 'inactive') recorder.stop()
    recorder.stream.getTracks().forEach((track) => track.stop())
    transition('idle')
  }, [transition])

  const toggle = useCallback(async (): Promise<boolean> => {
    if (mediaRef.current) {
      stop()
      return false
    }
    if (startingRef.current) return false
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      transition('unsupported')
      return false
    }
    startingRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: BlobPart[] = []
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const extension = extensionOf(recorder.mimeType)
      recorder.ondataavailable = (event) => chunks.push(event.data)
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${downloadName}.${extension}`
        link.click()
        URL.revokeObjectURL(url)
        transition('downloaded')
      }
      recorder.start()
      mediaRef.current = recorder
      transition('recording')
      return true
    } catch {
      transition('denied')
      return false
    } finally {
      startingRef.current = false
    }
  }, [stop, transition, downloadName])

  useEffect(() => () => release(), [release])

  const recording = status === 'recording'
  return { status, recording, toggle, stop }
}
