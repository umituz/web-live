import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RECORDING_AUDIO_BITRATE,
  RECORDING_HEIGHT,
  RECORDING_SEGMENT_MS,
  RECORDING_VIDEO_BITRATE,
  RECORDING_WIDTH,
  pickRecordingMimeType,
} from './recording'

export type CompositeRecorderFailure = 'unsupported' | 'startFailed'
export type CompositeRecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping'

export class PermanentUploadError extends Error {
  constructor(message?: string) {
    super(message ?? 'permanent upload failure')
    this.name = 'PermanentUploadError'
  }
}

export interface CompositeRecorderEndpoints {

  start(): Promise<{ recording: { id: string } }>

  uploadPart(input: {
    recordingId: string
    part: number
    blob: Blob
    contentType: string
  }): Promise<boolean>

  finish(recordingId: string): Promise<unknown>

  finishBeaconUrl(recordingId: string): string
}

export interface UseCompositeRecorder {
  status: CompositeRecorderStatus

  seconds: number

  pendingUploads: number

  uploadFailures: number
  failure: CompositeRecorderFailure | null
  start: () => void
  stop: () => void
}

const UPLOAD_ATTEMPTS = 3
const DRAW_INTERVAL_MS = 100

export function useCompositeRecorder({
  enabled,
  webcamStream,
  screenStream,
  remoteStreams,
  screenSharerId,
  myClientId,
  endpoints,
}: {

  enabled: boolean
  webcamStream: MediaStream | null
  screenStream: MediaStream | null
  remoteStreams: Record<string, MediaStream>
  screenSharerId: string | null
  myClientId: string
  endpoints: CompositeRecorderEndpoints
}): UseCompositeRecorder {
  const [status, setStatus] = useState<CompositeRecorderStatus>('idle')
  const [seconds, setSeconds] = useState(0)
  const [pendingUploads, setPendingUploads] = useState(0)
  const [uploadFailures, setUploadFailures] = useState(0)
  const [failure, setFailure] = useState<CompositeRecorderFailure | null>(null)

  const inputsRef = useRef({ webcamStream, screenStream, remoteStreams, screenSharerId, myClientId })
  useEffect(() => {
    inputsRef.current = { webcamStream, screenStream, remoteStreams, screenSharerId, myClientId }
  })
  const endpointsRef = useRef(endpoints)
  useEffect(() => {
    endpointsRef.current = endpoints
  })

  const activeRef = useRef(false)
  const mimeTypeRef = useRef('')
  const recordingIdRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasStreamRef = useRef<MediaStream | null>(null)
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const videoSourceRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const wiredTracksRef = useRef(new Map<string, MediaStreamAudioSourceNode>())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const drawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentPartRef = useRef(1)
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve())

  const activeVideoStream = (): MediaStream | null => {
    const { webcamStream: cam, screenStream: scr, remoteStreams: remotes, screenSharerId: sharer, myClientId: me } =
      inputsRef.current

    if (sharer && sharer === me && scr?.getVideoTracks().length) return scr
    if (sharer && sharer !== me && remotes[sharer]?.getVideoTracks().length) return remotes[sharer]
    return cam
  }

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const stream = activeVideoStream()
    if (stream && stream !== videoSourceRef.current) {
      videoSourceRef.current = stream
      const video = videoElRef.current
      if (video) {
        video.srcObject = stream
        void video.play().catch(() => {})
      }
    }
    const video = videoElRef.current
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {

      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
      const width = video.videoWidth * scale
      const height = video.videoHeight * scale
      ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    }
  }, [])

  const rewireAudio = useCallback(() => {
    const audioCtx = audioCtxRef.current
    const dest = mixDestRef.current
    if (!audioCtx || !dest) return
    const { webcamStream: cam, screenStream: scr, remoteStreams: remotes } = inputsRef.current
    const tracks = [
      ...(cam?.getAudioTracks() ?? []),
      ...(scr?.getAudioTracks() ?? []),
      ...Object.values(remotes).flatMap((stream) => stream.getAudioTracks()),
    ]
    const live = new Set(tracks.map((track) => track.id))
    for (const [trackId, node] of wiredTracksRef.current) {
      if (!live.has(trackId)) {
        node.disconnect()
        wiredTracksRef.current.delete(trackId)
      }
    }
    for (const track of tracks) {
      if (wiredTracksRef.current.has(track.id)) continue
      try {
        const node = audioCtx.createMediaStreamSource(new MediaStream([track]))
        node.connect(dest)
        wiredTracksRef.current.set(track.id, node)
      } catch {

      }
    }
  }, [])

  const uploadPart = useCallback(
    async (recordingId: string, part: number, blob: Blob) => {

      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
        try {
          const ok = await endpointsRef.current.uploadPart({
            recordingId,
            part,
            blob,
            contentType: mimeTypeRef.current,
          })
          if (ok) return
        } catch (err) {

          if (err instanceof PermanentUploadError) break

        }
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt))
      }
      setUploadFailures((prev) => prev + 1)
    },
    [],
  )

  const teardownMachinery = useCallback(() => {
    if (drawTimerRef.current) clearInterval(drawTimerRef.current)
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
    if (tickTimerRef.current) clearInterval(tickTimerRef.current)
    drawTimerRef.current = null
    segmentTimerRef.current = null
    tickTimerRef.current = null
    for (const node of wiredTracksRef.current.values()) node.disconnect()
    wiredTracksRef.current.clear()
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    mixDestRef.current = null
    canvasStreamRef.current?.getTracks().forEach((track) => track.stop())
    canvasStreamRef.current = null
    canvasRef.current = null
    if (videoElRef.current) videoElRef.current.srcObject = null
    videoElRef.current = null
    videoSourceRef.current = null
    recorderRef.current = null
  }, [])

  const startSegment = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || !activeRef.current) return
    recorder.start()
    segmentTimerRef.current = setTimeout(() => {

      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }, RECORDING_SEGMENT_MS)
  }, [])

  const start = useCallback(() => {
    if (!enabled || activeRef.current) return
    if (
      typeof MediaRecorder === 'undefined' ||
      typeof MediaRecorder.isTypeSupported !== 'function'
    ) {
      setFailure('unsupported')
      return
    }
    const mime = pickRecordingMimeType((candidate) => MediaRecorder.isTypeSupported(candidate))
    if (!mime) {
      setFailure('unsupported')
      return
    }
    setStatus('starting')
    setFailure(null)
    setSeconds(0)
    setPendingUploads(0)
    setUploadFailures(0)

    void (async () => {
      try {
        const res = await endpointsRef.current.start()
        recordingIdRef.current = res.recording.id
        mimeTypeRef.current = mime
        segmentPartRef.current = 1
        uploadChainRef.current = Promise.resolve()

        const canvas = document.createElement('canvas')
        canvas.width = RECORDING_WIDTH
        canvas.height = RECORDING_HEIGHT
        canvasRef.current = canvas

        const video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        videoElRef.current = video
        videoSourceRef.current = null

        const audioCtx = new AudioContext()
        void audioCtx.resume().catch(() => {})
        audioCtxRef.current = audioCtx
        mixDestRef.current = audioCtx.createMediaStreamDestination()
        wiredTracksRef.current = new Map()

        drawFrame()
        rewireAudio()

        const canvasStream = canvas.captureStream(10)
        canvasStreamRef.current = canvasStream

        const canvasVideoTrack = canvasStream.getVideoTracks()[0]
        if (!canvasVideoTrack) throw new Error('canvas capture produced no video track')
        const combined = new MediaStream([
          canvasVideoTrack,
          ...mixDestRef.current.stream.getAudioTracks(),
        ])
        const recorder = new MediaRecorder(combined, {
          mimeType: mime,
          videoBitsPerSecond: RECORDING_VIDEO_BITRATE,
          audioBitsPerSecond: RECORDING_AUDIO_BITRATE,
        })
        recorder.ondataavailable = (event) => {
          if (event.data.size === 0) return

          const uploadRecordingId = res.recording.id
          const part = segmentPartRef.current
          setPendingUploads((prev) => prev + 1)
          uploadChainRef.current = uploadChainRef.current
            .then(() => uploadPart(uploadRecordingId, part, event.data))
            .finally(() => setPendingUploads((prev) => Math.max(0, prev - 1)))
        }
        recorder.onstop = () => {
          if (!activeRef.current) return
          segmentPartRef.current += 1
          startSegment()
        }
        recorderRef.current = recorder

        activeRef.current = true
        setStatus('recording')
        startSegment()
        drawTimerRef.current = setInterval(() => {
          drawFrame()
          rewireAudio()
        }, DRAW_INTERVAL_MS)
        tickTimerRef.current = setInterval(() => {
          setSeconds((prev) => prev + 1)
        }, 1000)
      } catch {
        activeRef.current = false
        teardownMachinery()
        recordingIdRef.current = null
        setStatus('idle')
        setFailure('startFailed')
      }
    })()
  }, [enabled, drawFrame, rewireAudio, startSegment, teardownMachinery, uploadPart])

  const stop = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    setStatus('stopping')
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
    segmentTimerRef.current = null
    const recorder = recorderRef.current
    const recordingId = recordingIdRef.current
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    } catch {

    }
    teardownMachinery()
    recordingIdRef.current = null
    setStatus('idle')
    if (recordingId) {

      void endpointsRef
        .current.finish(recordingId)
        .catch(() => {})
    }
  }, [teardownMachinery])

  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  })
  useEffect(() => {
    return () => {
      stopRef.current()
    }
  }, [])

  useEffect(() => {
    if (status !== 'recording') return
    const onPageHide = () => {
      const recordingId = recordingIdRef.current
      if (recordingId && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(endpointsRef.current.finishBeaconUrl(recordingId))
      }
      stopRef.current()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [status])

  return { status, seconds, pendingUploads, uploadFailures, failure, start, stop }
}
