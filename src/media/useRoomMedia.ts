import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'

export interface RoomMediaState {
  micActive: boolean
  setMicActive: Dispatch<SetStateAction<boolean>>
  cameraActive: boolean
  setCameraActive: Dispatch<SetStateAction<boolean>>
  isScreenSharing: boolean
  screenStream: MediaStream | null
  webcamStream: MediaStream | null
  screenVideoRef: RefObject<HTMLVideoElement | null>
  webcamVideoRef: RefObject<HTMLVideoElement | null>
  gridWebcamVideoRef: RefObject<HTMLVideoElement | null>
  toggleScreenShare: () => Promise<MediaStream | null>
  /** getUserMedia failed (permission denied / no device) — no local media. */
  mediaBlocked: boolean
  retryMedia: () => void
}

const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}

/**
 * Local media for a live room. One getUserMedia({video, audio}) call acquires
 * BOTH tracks up front (so WebRTC negotiations always see the same m-lines);
 * the mic/camera toggles then just flip `track.enabled`, which needs no
 * renegotiation and no teardown. Tracks start DISABLED — nobody joins hot.
 *
 * The hook owns capture only, never presentation: screen share start/stop is
 * reported through `onScreenShareState` so the host can drive its own layout
 * (e.g. flip to a presentation mode while a share is live).
 */
export function useRoomMedia({
  onScreenShareState,
}: {
  /**
   * Fired with `true` when a screen share starts and `false` when it ends —
   * via the toggle, the browser's own "stop sharing" bar, or a decline. Fired
   * on every end without knowing the host's layout, so guard the layout write
   * in the callback if you also allow manual layout overrides.
   */
  onScreenShareState?: (active: boolean) => void
}): RoomMediaState {
  const [micActive, setMicActive] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [mediaBlocked, setMediaBlocked] = useState(false)
  const [acquireTick, setAcquireTick] = useState(0)

  // Latest callback via ref: the async toggle and the track's onended closure
  // would otherwise capture the render-time value forever.
  const onScreenShareStateRef = useRef(onScreenShareState)
  onScreenShareStateRef.current = onScreenShareState

  const screenStreamRef = useRef<MediaStream | null>(null)
  screenStreamRef.current = screenStream

  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const webcamVideoRef = useRef<HTMLVideoElement>(null)
  const gridWebcamVideoRef = useRef<HTMLVideoElement>(null)

  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
        screenStreamRef.current = null
      }
    }
  }, [])

  // Acquire (or re-acquire after a retry) the single local stream.
  useEffect(() => {
    if (webcamStreamRef.current) return
    let cancelled = false
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMediaBlocked(true)
      return
    }
    navigator.mediaDevices
      .getUserMedia(MEDIA_CONSTRAINTS)
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        // Tracks start disabled; the toggles flip `enabled` in place.
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false
        })
        stream.getVideoTracks().forEach((track) => {
          track.enabled = false
        })
        webcamStreamRef.current = stream
        setWebcamStream(stream)
        setMediaBlocked(false)
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream
        }
      })
      .catch(() => {
        if (cancelled) return
        webcamStreamRef.current = null
        setWebcamStream(null)
        setMediaBlocked(true)
      })
    return () => {
      cancelled = true
    }
  }, [acquireTick])

  // Stop the stream for good when the room unmounts.
  useEffect(() => {
    return () => {
      webcamStreamRef.current?.getTracks().forEach((track) => track.stop())
      webcamStreamRef.current = null
    }
  }, [])

  const retryMedia = useCallback(() => {
    setAcquireTick((tick) => tick + 1)
  }, [])

  // Mic toggle: flip the live track's `enabled` — instant, no renegotiation.
  const toggleMic = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setMicActive((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      const stream = webcamStreamRef.current
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = value
        })
      }
      return value
    })
  }, [])

  // Camera toggle: same enabled-flip trick.
  const toggleCam = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setCameraActive((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      const stream = webcamStreamRef.current
      if (stream) {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = value
        })
      }
      return value
    })
  }, [])

  /** Starts/stops the capture; resolves with the stream (or null on stop/decline). */
  const toggleScreenShare = async (): Promise<MediaStream | null> => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop())
        setScreenStream(null)
      }
      setIsScreenSharing(false)
      onScreenShareStateRef.current?.(false)
      return null
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        setScreenStream(stream)
        setIsScreenSharing(true)
        onScreenShareStateRef.current?.(true)

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream
        }

        // The browser's own "stop sharing" bar ends the track without us, so
        // follow it to keep the room state truthful.
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setIsScreenSharing(false)
            setScreenStream(null)
            onScreenShareStateRef.current?.(false)
          }
        })
        return stream
      }
    } catch {
    }
    return null
  }

  // Hosts typically remount these <video> elements when the layout flips (the
  // host derives layout from onScreenShareState), and a freshly mounted
  // element has no srcObject — so re-attach whenever the share state changes.
  // A host that remounts elements on layout changes of its own re-attaches
  // from the returned streams in its own effect.
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream
    }
  }, [screenStream, isScreenSharing])

  useEffect(() => {
    for (const ref of [webcamVideoRef, gridWebcamVideoRef]) {
      if (ref.current) ref.current.srcObject = webcamStream
    }
  }, [webcamStream, isScreenSharing, cameraActive])

  return {
    micActive,
    setMicActive: toggleMic,
    cameraActive,
    setCameraActive: toggleCam,
    isScreenSharing,
    screenStream,
    webcamStream,
    screenVideoRef,
    webcamVideoRef,
    gridWebcamVideoRef,
    toggleScreenShare,
    mediaBlocked,
    retryMedia,
  }
}
