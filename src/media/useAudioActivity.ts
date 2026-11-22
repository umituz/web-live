import { useEffect, useState } from 'react'

export interface AudioActivityOptions {
  speakingThreshold?: number
  pollIntervalMs?: number
  enabled?: boolean
}

export interface AudioActivityState {
  volume: number
  isSpeaking: boolean
  isActive: boolean
}

export function computeRmsVolume(buffer: Uint8Array): number {
  if (buffer.length === 0) return 0
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i] ?? 0
    sum += val * val
  }
  const rms = Math.sqrt(sum / buffer.length)
  return Math.min(100, Math.round((rms / 255) * 100))
}

export function isSpeakingFromVolume(volume: number, threshold = 15): boolean {
  return volume >= threshold
}

export function useAudioActivity(
  stream: MediaStream | null,
  options: AudioActivityOptions = {},
): AudioActivityState {
  const { speakingThreshold = 15, pollIntervalMs = 80, enabled = true } = options
  const [volume, setVolume] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (!stream || !enabled || typeof window === 'undefined') {
      setVolume(0)
      setIsSpeaking(false)
      setIsActive(false)
      return
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      setVolume(0)
      setIsSpeaking(false)
      setIsActive(false)
      return
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) {
      setVolume(0)
      setIsSpeaking(false)
      setIsActive(false)
      return
    }

    let audioCtx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let timerId: ReturnType<typeof setInterval> | null = null
    let isCancelled = false

    try {
      audioCtx = new AudioContextClass()
      source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      setIsActive(true)

      timerId = setInterval(() => {
        if (isCancelled || !analyser) return
        analyser.getByteFrequencyData(buffer)
        const vol = computeRmsVolume(buffer)
        const speaking = isSpeakingFromVolume(vol, speakingThreshold)
        setVolume(vol)
        setIsSpeaking(speaking)
      }, pollIntervalMs)
    } catch {
      setIsActive(false)
    }

    return () => {
      isCancelled = true
      if (timerId) clearInterval(timerId)
      if (source && analyser) {
        try {
          source.disconnect()
        } catch {
        }
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          void audioCtx.close()
        } catch {
        }
      }
      setVolume(0)
      setIsSpeaking(false)
      setIsActive(false)
    }
  }, [stream, enabled, speakingThreshold, pollIntervalMs])

  return { volume, isSpeaking, isActive }
}
