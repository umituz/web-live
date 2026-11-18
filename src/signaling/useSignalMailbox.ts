import { useCallback, useEffect, useRef } from 'react'
import type { SignalTransport } from './transport'
import { parseLiveSignal } from './negotiate'
import type { LiveSignal, WirePayload } from './negotiate'
import {
  SIGNAL_FAST_POLL_MS,
  SIGNAL_HIDDEN_POLL_MS,
  SIGNAL_STEADY_POLL_MS,
} from '../core/constants'

/**
 * WebRTC signaling mailbox client. Polls `transport.consume` on a setTimeout
 * chain (no drift, backs off when the tab hides) and delivers each parsed
 * signal to `onSignal` in seq order. While a handshake is in flight the loop
 * runs at 1s; once everything is connected it settles at 4s — late joiners'
 * offers still arrive, just a beat slower.
 */
export function useSignalMailbox({
  clientId,
  transport,
  enabled,
  fast,
  onSignal,
}: {
  /** This client's mailbox address (shared with the presence layer). */
  clientId: string
  /** Bound to one room by the caller (see createHttpSignalTransport). */
  transport: SignalTransport | null
  enabled: boolean
  /** true while any peer connection is still negotiating (fast cadence). */
  fast: boolean
  onSignal: (signal: LiveSignal) => void
}): {
  send: (to: string, signal: WirePayload) => Promise<boolean>
} {
  const onSignalRef = useRef(onSignal)
  onSignalRef.current = onSignal
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const stoppedRef = useRef(true)

  const poll = useCallback(async () => {
    if (!transport || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const rows = await transport.consume(clientId)
      for (const row of rows) {
        const signal = parseLiveSignal(row)
        if (signal) onSignalRef.current(signal)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [transport, clientId])

  useEffect(() => {
    if (!enabled || !transport) return
    stoppedRef.current = false

    const schedule = () => {
      if (stoppedRef.current) return
      const base = fast ? SIGNAL_FAST_POLL_MS : SIGNAL_STEADY_POLL_MS
      const hidden =
        typeof document !== 'undefined' && document.visibilityState === 'hidden'
      const delay = hidden ? Math.max(base, SIGNAL_HIDDEN_POLL_MS) : base
      timerRef.current = setTimeout(async () => {
        await poll()
        schedule()
      }, delay)
    }
    void poll()
    schedule()

    return () => {
      stoppedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, transport, fast, poll])

  const send = useCallback(
    async (to: string, signal: WirePayload) => {
      if (!transport) return false
      return transport.send({ from: clientId, to, payload: signal })
    },
    [transport, clientId],
  )

  return { send }
}
