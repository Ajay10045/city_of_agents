import { useEffect, useMemo, useRef, useState } from 'react'
import type { Citizen } from '../../types'
import type { CityLayout } from '../../lib/cityLayout'
import { voteBus } from '../../lib/voteBus'
import { buildCrowd } from './crowdLayout'

// ─── Speech Bubble Layer ──────────────────────────────────────────────────────
// HTML overlay over the map. During a poll, a throttled queue of citizen
// reactions pops up as speech bubbles anchored to that citizen's map position
// (converted from SVG viewBox coords to container %). Max ~3 visible at once.

interface Bubble {
  id: number
  citizenId: string
  name: string
  text: string
  sentiment: string
  xPct: number
  yPct: number
  at: number
}

const MAX_BUBBLES = 3
const BUBBLE_MS = 3200
const THROTTLE_MS = 700

export function SpeechBubbleLayer({ citizens, layout }: { citizens: Citizen[]; layout: CityLayout }) {
  const posById = useMemo(() => {
    const m = new Map<string, { xPct: number; yPct: number }>()
    for (const d of buildCrowd(citizens, layout)) {
      m.set(d.id, { xPct: (d.x / layout.width) * 100, yPct: (d.y / layout.height) * 100 })
    }
    return m
  }, [citizens, layout])

  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const lastShown = useRef(0)
  const nextId = useRef(0)

  useEffect(() => {
    const off = voteBus.onVote(({ voice }) => {
      const now = Date.now()
      if (now - lastShown.current < THROTTLE_MS) return
      const pos = posById.get(voice.citizen_id)
      if (!pos) return
      lastShown.current = now
      const b: Bubble = {
        id: nextId.current++,
        citizenId: voice.citizen_id,
        name: voice.name,
        text: voice.reaction,
        sentiment: voice.sentiment,
        xPct: pos.xPct,
        yPct: pos.yPct,
        at: now,
      }
      setBubbles(prev => [...prev.slice(-(MAX_BUBBLES - 1)), b])
    })
    return off
  }, [posById])

  // Expire bubbles
  useEffect(() => {
    if (bubbles.length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setBubbles(prev => prev.filter(b => now - b.at < BUBBLE_MS))
    }, 400)
    return () => clearInterval(t)
  }, [bubbles])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`@keyframes coaBubbleIn { from { opacity: 0; transform: translate(-50%, -90%) scale(0.85) } to { opacity: 1; transform: translate(-50%, -100%) scale(1) } }`}</style>
      {bubbles.map(b => {
        const color = b.sentiment === 'approve' ? '#4ade80' : b.sentiment === 'disapprove' ? '#f87171' : '#e8a030'
        // clamp horizontal so bubbles don't overflow
        const left = Math.max(14, Math.min(86, b.xPct))
        return (
          <div key={b.id} style={{
            position: 'absolute', left: `${left}%`, top: `${b.yPct}%`,
            transform: 'translate(-50%, -100%)', maxWidth: 190,
            animation: 'coaBubbleIn 0.2s ease-out',
          }}>
            <div style={{
              background: 'rgba(9,20,34,0.95)', border: `1px solid ${color}66`,
              borderRadius: 8, padding: '5px 8px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}>
              <div style={{
                fontSize: 8, fontWeight: 700, color, fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: '0.06em', marginBottom: 1,
              }}>{b.name.toUpperCase()}</div>
              <div style={{ fontSize: 9, color: '#dbe7f5', lineHeight: 1.35 }}>
                {b.text.length > 90 ? b.text.slice(0, 88) + '…' : b.text}
              </div>
            </div>
            <div style={{
              width: 0, height: 0, marginLeft: 12,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: `6px solid ${color}66`,
            }} />
          </div>
        )
      })}
    </div>
  )
}
