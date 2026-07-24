import { useEffect, useMemo, useRef, useState } from 'react'
import type { Citizen } from '../../types'
import type { CityLayout } from '../../lib/cityLayout'
import { voteBus, type PollPhase } from '../../lib/voteBus'
import { buildCrowd, alignmentColor, type CrowdDot } from './crowdLayout'

// ─── Live Citizen Crowd ───────────────────────────────────────────────────────
// Renders the 50 citizens as dots inside their districts. During a poll, each
// incoming approval_vote flashes that citizen's dot green (cheer) or red (boo);
// non-polled citizens dim while the poll runs. Rendered inside the map <svg>.

type Reaction = 'idle' | 'cheer' | 'boo'

interface CrowdReactionState {
  [id: string]: { reaction: Reaction; at: number }
}

const REACTION_MS = 1400

export function CitizenCrowd({ citizens, layout }: { citizens: Citizen[]; layout: CityLayout }) {
  const dots = useMemo(() => buildCrowd(citizens, layout), [citizens, layout])
  const dotById = useMemo(() => {
    const m = new Map<string, CrowdDot>()
    for (const d of dots) m.set(d.id, d)
    return m
  }, [dots])

  const [reactions, setReactions] = useState<CrowdReactionState>({})
  const [phase, setPhase] = useState<PollPhase>(voteBus.phase)
  const votedThisPoll = useRef<Set<string>>(new Set())

  // Subscribe to the vote bus
  useEffect(() => {
    const offPhase = voteBus.onPhase(p => {
      setPhase(p)
      if (p === 'polling') {
        votedThisPoll.current = new Set()
        setReactions({})
      }
    })
    const offVote = voteBus.onVote(({ voice }) => {
      if (!dotById.has(voice.citizen_id)) return
      votedThisPoll.current.add(voice.citizen_id)
      const reaction: Reaction = voice.sentiment === 'approve' ? 'cheer' : voice.sentiment === 'disapprove' ? 'boo' : 'idle'
      setReactions(prev => ({ ...prev, [voice.citizen_id]: { reaction, at: Date.now() } }))
    })
    return () => { offPhase(); offVote() }
  }, [dotById])

  // Expire reactions
  useEffect(() => {
    if (Object.keys(reactions).length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setReactions(prev => {
        let changed = false
        const next: CrowdReactionState = {}
        for (const [id, r] of Object.entries(prev)) {
          if (now - r.at < REACTION_MS) next[id] = r
          else changed = true
        }
        return changed ? next : prev
      })
    }, 300)
    return () => clearInterval(t)
  }, [reactions])

  const polling = phase === 'polling'

  return (
    <g>
      <style>{`
        @keyframes coaCheer { 0% { transform: translateY(0) scale(1) } 40% { transform: translateY(-6px) scale(1.7) } 100% { transform: translateY(0) scale(1) } }
        @keyframes coaBoo { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-2.5px) } 75% { transform: translateX(2.5px) } }
        @keyframes coaSway { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }
        .coa-dot-cheer { animation: coaCheer 0.7s ease-out; transform-box: fill-box; transform-origin: center }
        .coa-dot-boo { animation: coaBoo 0.5s ease-in-out 2; transform-box: fill-box; transform-origin: center }
        @media (prefers-reduced-motion: reduce) { .coa-dot-cheer, .coa-dot-boo { animation: none } }
      `}</style>
      {dots.map(dot => {
        const r = reactions[dot.id]?.reaction
        const voted = r != null
        const dim = polling && !voted
        const fill =
          r === 'cheer' ? '#4ade80'
          : r === 'boo' ? '#f87171'
          : alignmentColor(dot.alignment)
        const radius = voted ? 4.2 : 3
        return (
          <circle
            key={dot.id}
            cx={dot.x}
            cy={dot.y}
            r={radius}
            fill={fill}
            opacity={dim ? 0.28 : 0.92}
            stroke="rgba(4,10,20,0.7)"
            strokeWidth={0.8}
            className={r === 'cheer' ? 'coa-dot-cheer' : r === 'boo' ? 'coa-dot-boo' : undefined}
            style={{ transition: 'fill 0.3s ease, opacity 0.3s ease, r 0.3s ease' }}
          />
        )
      })}
    </g>
  )
}
