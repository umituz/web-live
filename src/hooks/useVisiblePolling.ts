import { useEffect, useRef } from 'react'

/**
 * Visibility-adaptive polling: the interval only ticks while the tab is
 * visible, a hidden tab pays nothing, and returning to the tab fires the
 * callback once immediately so fresh state shows without waiting a full
 * period. The initial load stays with the caller — this hook only keeps
 * things fresh.
 */
export function useVisiblePolling(callback: () => void, periodMs: number): void {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const tick = () => cbRef.current()
    // window.setInterval (DOM) returns a numeric id — not Node's Timeout.
    let timer: number | null = null
    const start = () => {
      if (timer === null) timer = window.setInterval(tick, periodMs)
    }
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        stop()
        tick() // catch up immediately — no full-period wait after focus
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [periodMs])
}
