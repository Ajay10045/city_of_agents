import { useEffect, useRef, useState } from 'react'

// ─── Animated count-up number ─────────────────────────────────────────────────
// Eases from the previous value to the new value whenever `value` changes.

export function CountUp({
  value,
  duration = 700,
  format = (v: number) => Math.round(v).toString(),
  style,
}: {
  value: number
  duration?: number
  format?: (v: number) => string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setDisplay(to); fromRef.current = to; return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)   // easeOutCubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return <span style={style}>{format(display)}</span>
}
