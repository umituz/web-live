import { useEffect, useRef } from 'react'

export function useVisiblePolling(callback: () => void, periodMs: number): void {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const tick = () => cbRef.current()

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
        tick()
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
