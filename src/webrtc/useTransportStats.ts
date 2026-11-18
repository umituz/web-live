import { useEffect, useRef, useState } from 'react'

export type LinkQuality = 'good' | 'fair' | 'poor'

export interface TransportStatsState {
  quality: LinkQuality
  rttMs: number | null
  jitterMs: number | null
  lossRatio: number | null
}

const POLL_MS = 5_000

/**
 * Pure mapping from transport counters to a three-state badge value.
 * Thresholds sit between "imperceptible" and "annoying" for real-time calls:
 * below ~150ms RTT / 2% loss nobody notices; past ~400ms / 8% it hurts.
 */
export function deriveQuality(input: {
  rttMs: number | null
  jitterMs: number | null
  lossRatio: number | null
}): LinkQuality {
  const { rttMs, jitterMs, lossRatio } = input
  const rtt = rttMs ?? 0
  const jitter = jitterMs ?? 0
  const loss = lossRatio ?? 0
  if (rtt <= 150 && jitter <= 30 && loss <= 0.02) return 'good'
  if (rtt <= 400 && jitter <= 60 && loss <= 0.08) return 'fair'
  return 'poor'
}

/** Picks the worst-case counters across the reports we care about. */
export function summarizeStats(
  reports: RTCStatsReport[],
): { rttMs: number | null; jitterMs: number | null; lossRatio: number | null } {
  let rttMs: number | null = null
  let jitterMs: number | null = null
  let lost = 0
  let received = 0
  for (const report of reports) {
    for (const stats of report.values()) {
      const entry = stats as Record<string, unknown>
      if (entry.type === 'candidate-pair' && entry.nominated === true) {
        const rtt = typeof entry.currentRoundTripTime === 'number' ? entry.currentRoundTripTime * 1000 : null
        if (rtt !== null && (rttMs === null || rtt > rttMs)) rttMs = rtt
      } else if (entry.type === 'inbound-rtp' && typeof entry.packetsReceived === 'number') {
        const jitter =
          typeof entry.jitter === 'number' ? entry.jitter * 1000 : null
        if (jitter !== null && (jitterMs === null || jitter > jitterMs)) jitterMs = jitter
        const packetsLost = typeof entry.packetsLost === 'number' ? Math.max(0, entry.packetsLost) : 0
        lost += packetsLost
        received += entry.packetsReceived + packetsLost
      }
    }
  }
  const lossRatio = received > 0 ? lost / received : null
  return { rttMs, jitterMs, lossRatio }
}

/**
 * Samples getStats() on every live peer connection every 5s and reduces the
 * counters to one room-wide quality badge.
 */
export function useTransportStats(
  pcsRef: React.RefObject<Map<string, RTCPeerConnection>>,
  enabled: boolean,
): TransportStatsState {
  const [state, setState] = useState<TransportStatsState>({
    quality: 'good',
    rttMs: null,
    jitterMs: null,
    lossRatio: null,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const sample = async () => {
      const pcs = [...pcsRef.current.values()].filter(
        (pc) => pc.connectionState === 'connected',
      )
      if (pcs.length === 0) return
      try {
        const reports = await Promise.all(pcs.map((pc) => pc.getStats()))
        const summary = summarizeStats(reports)
        setState({ ...summary, quality: deriveQuality(summary) })
      } catch {
        // stats flaked out — keep the previous sample
      }
    }
    void sample()
    timerRef.current = setInterval(() => void sample(), POLL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [pcsRef, enabled])

  return state
}
