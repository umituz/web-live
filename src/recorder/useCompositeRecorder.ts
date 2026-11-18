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

/**
 * Reject `uploadPart` with this when the failure is permanent (4xx other
 * than 429): the hook stops retrying the part immediately.
 */
export class PermanentUploadError extends Error {
  constructor(message?: string) {
    super(message ?? 'permanent upload failure')
    this.name = 'PermanentUploadError'
  }
}

/**
 * The one seam between the recorder and the app's backend. Bind it per room
 * (close over the room id in the URL strings) — the hook owns every capture
 * concern and only ever calls these four.
 */
export interface CompositeRecorderEndpoints {
  /**
   * Create the recording server-side and resolve its id. Throwing (network
   * or non-2xx) maps to the hook's 'startFailed' failure mode.
   */
  start(): Promise<{ recording: { id: string } }>
  /**
   * Upload ONE part as a single POST and resolve true on 2xx, false on
   * failure (throw or non-ok). Keep it a one-shot request — the RETRY LOOP
   * lives in the hook, so an adapter that also retries would multiply the
   * attempt count. Raw-fetch semantics to mirror: same-origin credentials
   * (`credentials: 'same-origin'`) so the session cookie rides along, and
   * `Content-Type` = the passed `contentType` (the negotiated media mime,
   * e.g. video/webm;codecs=vp8,opus) — a raw media body, not multipart and
   * not JSON.
   *
   * A failure the app KNOWS is permanent (4xx other than 429 — bad part
   * number, too large, auth) should reject with `PermanentUploadError` so
   * the hook skips the remaining attempts instead of retrying a lost cause.
   */
  uploadPart(input: {
    recordingId: string
    part: number
    blob: Blob
    contentType: string
  }): Promise<boolean>
  /**
   * Graceful finish for the stop() path. Must be idempotent: it can race the
   * pagehide beacon hitting the same endpoint (see finishBeaconUrl).
   */
  finish(recordingId: string): Promise<unknown>
  /**
   * URL of the same idempotent finish endpoint for the unload path —
   * navigator.sendBeacon takes a URL, not a function, so the app hands the
   * finish route over as a string. Keep it a same-origin path so the beacon
   * carries the session cookie.
   */
  finishBeaconUrl(recordingId: string): string
}

export interface UseCompositeRecorder {
  status: CompositeRecorderStatus
  /** Wall-clock seconds of the current capture (ticks once per second). */
  seconds: number
  /** Parts queued for upload right now (uploads run sequentially). */
  pendingUploads: number
  /** Parts that permanently failed to upload — the recording has a gap. */
  uploadFailures: number
  failure: CompositeRecorderFailure | null
  start: () => void
  stop: () => void
}

const UPLOAD_ATTEMPTS = 3
const DRAW_INTERVAL_MS = 100

/**
 * Host-side composite room recording. The active video (shared screen,
 * else the host camera) is composited onto an offscreen canvas while an
 * AudioContext mixes every track in the room (own mic + screen audio + all
 * remotes) — nobody re-records their own echo because the mix never routes
 * back to the speakers.
 *
 * MediaRecorder runs FULL start/stop cycles per ~2min part: timeslice chunks
 * are EBML fragments that cannot play standalone, while every stopped blob
 * is a complete file. Parts upload sequentially as they finalize.
 */
export function useCompositeRecorder({
  enabled,
  webcamStream,
  screenStream,
  remoteStreams,
  screenSharerId,
  myClientId,
  endpoints,
}: {
  /** Host-only: students never record. */
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

  // Live inputs: the draw loop must always see the CURRENT streams, not the
  // ones captured at start() — screen share can begin/end mid-recording.
  // Endpoints get the same treatment so apps can pass an inline object
  // without churning every callback below.
  const inputsRef = useRef({ webcamStream, screenStream, remoteStreams, screenSharerId, myClientId })
  inputsRef.current = { webcamStream, screenStream, remoteStreams, screenSharerId, myClientId }
  const endpointsRef = useRef(endpoints)
  endpointsRef.current = endpoints

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
    // Mirror the stage: whoever holds the share slot is the big picture.
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
      // Object-fit contain: preserve aspect, center, letterbox the rest.
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
      const width = video.videoWidth * scale
      const height = video.videoHeight * scale
      ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    }
  }, [])

  /** Adds/removes audio source nodes so joiners mid-recording are captured. */
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
        // A dead track (peer left between snapshot and wire) — skip it.
      }
    }
  }, [])

  const uploadPart = useCallback(
    async (recordingId: string, part: number, blob: Blob) => {
      // The retry cadence is the hook's generic value: adapters stay one-shot
      // POSTs, and three spaced attempts bound the damage of a flaky link.
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
          // The app flagged this failure as permanent (e.g. 4xx other than
          // 429): retrying a rejected part only burns two more POSTs.
          if (err instanceof PermanentUploadError) break
          // Any other throw is a transport hiccup — fall through to the
          // backoff and retry like a false resolve.
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
      // Full stop → the blob is a standalone file; a new segment follows.
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
        // captureStream(10) always yields exactly one video track; the guard
        // only keeps noUncheckedIndexedAccess honest (a missing track would
        // have thrown inside the MediaStream constructor anyway).
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
          // Captured at creation: stop() nulls the ref before the FINAL
          // dataavailable fires, and that last part must still upload.
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
      // Already inactive — nothing to flush.
    }
    teardownMachinery()
    recordingIdRef.current = null
    setStatus('idle')
    if (recordingId) {
      // Last part may still be uploading; finish clears the consent flag
      // server-side and is retried by the room leaving this state anyway.
      void endpointsRef
        .current.finish(recordingId)
        .catch(() => {})
    }
  }, [teardownMachinery])

  // Leaving the room (or unmount) must not strand an active recording.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    return () => {
      stopRef.current()
    }
  }, [])

  // Tab close / external navigation mid-recording: unmount cleanup does not
  // reliably fire there (mobile especially), and even when it runs, the
  // plain `finish` fetch is killed during unload. sendBeacon rides the
  // session cookie and survives — the room drops its consent flag and the
  // recording gets its wall-clock end (finish is idempotent server-side, so
  // the beacon racing stop()'s fetch is safe). The part still being captured
  // is lost either way: beacon payloads cap far below a video part.
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
