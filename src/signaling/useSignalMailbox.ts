import { useCallback, useEffect, useRef } from 'react'
import type { SignalTransport } from './transport'
import { parseLiveSignal } from './negotiate'
import type { LiveSignal, WirePayload } from './negotiate'
import {
  SIGNAL_FAST_POLL_MS,
  SIGNAL_HIDDEN_POLL_MS,
  SIGNAL_STEADY_POLL_MS,
} from '../core/constants'

export function useSignalMailbox({
  clientId,
  transport,
  enabled,
  fast,
  onSignal,
}: {

  clientId: string

  transport: SignalTransport | null
  enabled: boolean

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
