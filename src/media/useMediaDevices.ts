import { useCallback, useEffect, useState } from 'react'

export interface MediaDeviceInfoSummary {
  deviceId: string
  label: string
  groupId: string
}

export interface MediaDevicesState {
  audioInputs: MediaDeviceInfoSummary[]
  videoInputs: MediaDeviceInfoSummary[]
  audioOutputs: MediaDeviceInfoSummary[]
  selectedAudioInputId: string | null
  selectedVideoInputId: string | null
  selectedAudioOutputId: string | null
  setSelectedAudioInputId: (deviceId: string | null) => void
  setSelectedVideoInputId: (deviceId: string | null) => void
  setSelectedAudioOutputId: (deviceId: string | null) => void
  refreshDevices: () => Promise<void>
  applyAudioOutput: (element: HTMLMediaElement, deviceId: string) => Promise<boolean>
  isSupported: boolean
  hasOutputSelection: boolean
}

export function filterDevicesByKind(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
): MediaDeviceInfoSummary[] {
  return devices
    .filter((d) => d.kind === kind)
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `${kind} (${d.deviceId.slice(0, 5)})`,
      groupId: d.groupId,
    }))
}

export function useMediaDevices(): MediaDevicesState {
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfoSummary[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfoSummary[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfoSummary[]>([])
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string | null>(null)
  const [selectedVideoInputId, setSelectedVideoInputId] = useState<string | null>(null)
  const [selectedAudioOutputId, setSelectedAudioOutputId] = useState<string | null>(null)

  const isSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.enumerateDevices)
  const hasOutputSelection = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

  const refreshDevices = useCallback(async () => {
    if (!isSupported) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioInputs(filterDevicesByKind(devices, 'audioinput'))
      setVideoInputs(filterDevicesByKind(devices, 'videoinput'))
      setAudioOutputs(filterDevicesByKind(devices, 'audiooutput'))
    } catch {
      setAudioInputs([])
      setVideoInputs([])
      setAudioOutputs([])
    }
  }, [isSupported])

  useEffect(() => {
    if (!isSupported) return
    void refreshDevices()

    const handleDeviceChange = () => {
      void refreshDevices()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [isSupported, refreshDevices])

  const applyAudioOutput = useCallback(async (element: HTMLMediaElement, deviceId: string): Promise<boolean> => {
    if (!('setSinkId' in element)) return false
    try {
      await (element as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId)
      setSelectedAudioOutputId(deviceId)
      return true
    } catch {
      return false
    }
  }, [])

  return {
    audioInputs,
    videoInputs,
    audioOutputs,
    selectedAudioInputId,
    selectedVideoInputId,
    selectedAudioOutputId,
    setSelectedAudioInputId,
    setSelectedVideoInputId,
    setSelectedAudioOutputId,
    refreshDevices,
    applyAudioOutput,
    isSupported,
    hasOutputSelection,
  }
}
