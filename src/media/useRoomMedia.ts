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

export function useRoomMedia({
  onScreenShareState,
}: {

  onScreenShareState?: (active: boolean) => void
}): RoomMediaState {
  const [micActive, setMicActive] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [mediaBlocked, setMediaBlocked] = useState(false)
  const [acquireTick, setAcquireTick] = useState(0)

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

  useEffect(() => {
    return () => {
      webcamStreamRef.current?.getTracks().forEach((track) => track.stop())
      webcamStreamRef.current = null
    }
  }, [])

  const retryMedia = useCallback(() => {
    setAcquireTick((tick) => tick + 1)
  }, [])

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
