import { useEffect, useRef } from 'react'

export function useVisiblePolling(callback: () => void, periodMs: number): void {
  const cbRef = useRef(callback)
  useEffect(() => {
    cbRef.current = callback
  })

  useEffect(() => {
    const tick = () => cbRef.current()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') tick()
    }, periodMs)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [periodMs])
}
