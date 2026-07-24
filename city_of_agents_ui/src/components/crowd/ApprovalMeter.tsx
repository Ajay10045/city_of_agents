import { useEffect, useRef, useState } from 'react'
import { voteBus, type PollPhase } from '../../lib/voteBus'

// ─── Live Approval Meter ──────────────────────────────────────────────────────
// A horizontal weighted-approval bar that swings live as votes stream in during
// a poll. Docks to the top edge of the city map. Idle state shows the current
// static approval; during a poll it accumulates weighted votes.

export function ApprovalMeter({ baseApproval }: { baseApproval: number }) {
  const [phase, setPhase] = useState<PollPhase>(voteBus.phase)
  const [live, setLive] = useState<number | null>(null)
  const [voteCount, setVoteCount] = useState(0)
  const approveW = useRef(0)
  const totalW = useRef(0)

  useEffect(() => {
    const offPhase = voteBus.onPhase(p => {
      setPhase(p)
      if (p === 'polling') {
        approveW.current = 0
        totalW.current = 0
        setLive(baseApproval)
        setVoteCount(0)
      }
      if (p === 'idle') setLive(null)
    })
    const offVote = voteBus.onVote(({ voice, weight }) => {
      totalW.current += weight
      if (voice.sentiment === 'approve') approveW.current += weight
      if (totalW.current > 0) setLive((approveW.current / totalW.current) * 100)
      setVoteCount(c => c + 1)
    })
    return () => { offPhase(); offVote() }
  }, [baseApproval])

  const polling = phase === 'polling'
  const value = live ?? baseApproval
  const color = value >= 55 ? '#4ade80' : value >= 45 ? '#f59e0b' : '#f87171'

  return (
    <div style={{
      position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
      width: 'min(78%, 460px)', zIndex: 4,
      background: 'rgba(6,14,26,0.82)', border: `1px solid ${polling ? color + '66' : '#1c3652'}`,
      borderRadius: 8, padding: '7px 12px', backdropFilter: 'blur(4px)',
      boxShadow: polling ? `0 0 18px ${color}33` : '0 4px 16px rgba(0,0,0,0.4)',
      transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: polling ? color : '#7ba8d1',
          fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.14em',
        }}>
          {polling ? '● LIVE APPROVAL' : 'MAYOR APPROVAL'}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {polling && (
            <span style={{ fontSize: 8, color: '#7ba8d1', fontFamily: "'Share Tech Mono', monospace" }}>
              {voteCount} votes
            </span>
          )}
          <span style={{
            fontSize: 16, fontWeight: 700, color,
            fontFamily: "'Share Tech Mono', monospace", lineHeight: 1,
            transition: 'color 0.3s ease',
          }}>{Math.round(value)}%</span>
        </div>
      </div>
      {/* Bar with 50% majority marker */}
      <div style={{ position: 'relative', height: 8, background: '#0a1a30', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, value))}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}bb, ${color})`,
          borderRadius: 4, boxShadow: `0 0 8px ${color}88`,
          transition: 'width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',   // spring-like
        }} />
      </div>
      {/* 50% majority line (drawn over the bar) */}
      <div style={{
        position: 'absolute', left: 'calc(12px + (100% - 24px) * 0.5)', bottom: 7,
        width: 1.5, height: 12, background: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
      }} />
    </div>
  )
}
