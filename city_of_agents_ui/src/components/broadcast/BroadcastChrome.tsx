import type { TurnOverlayPhase } from './TurnExecutionOverlay'

// ─── Broadcast chrome ─────────────────────────────────────────────────────────
// News-broadcast presentation pieces layered onto the turn overlay: a breaking
// banner, an outlet-lean-colored lower-third, and a phase chyron.

const PHASE_LABELS: Record<TurnOverlayPhase, string> = {
  announcement: 'POLICY BROADCAST',
  assignment: 'CABINET COMMAND',
  evaluation: 'FIELD ASSESSMENT',
  reactions: 'PUBLIC PULSE',
  poll: 'MANDATE POLL — LIVE',
  events: 'CITY SHOCKWAVE',
  debrief: 'DEBRIEF',
  complete: 'BROADCAST COMPLETE',
}

export function BreakingNewsBanner({ headline, tone = 'neutral' }: {
  headline: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const color = tone === 'good' ? '#22c55e' : tone === 'bad' ? '#f87171' : '#e8a030'
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', borderRadius: 6, overflow: 'hidden',
      border: `1px solid ${color}55`, boxShadow: `0 0 18px ${color}22`,
      animation: 'coaBreakingIn 0.35s ease',
    }}>
      <div style={{
        background: color, color: '#050d1b', fontWeight: 800,
        fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em',
        fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ animation: 'coaBlink 1s steps(2) infinite' }}>●</span> BREAKING
      </div>
      <div style={{
        flex: 1, background: 'rgba(6,14,26,0.9)', color: '#e8eef7',
        fontSize: 12, fontWeight: 600, padding: '6px 12px', display: 'flex', alignItems: 'center',
        overflow: 'hidden',
      }}>
        <span className="truncate">{headline}</span>
      </div>
      <style>{`
        @keyframes coaBreakingIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes coaBlink { 50% { opacity: 0.2 } }
        @media (prefers-reduced-motion: reduce) { [style*="coaBreakingIn"] { animation: none } }
      `}</style>
    </div>
  )
}

export function LowerThird({ outlet, headline, lean }: {
  outlet: string
  headline: string
  lean: 'mayor' | 'opposition' | 'neutral'
}) {
  const color = lean === 'mayor' ? '#e8a030' : lean === 'opposition' ? '#f87171' : '#38bdf8'
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', borderRadius: 5, overflow: 'hidden',
      border: '1px solid #14283f', background: 'rgba(6,14,26,0.85)',
      animation: 'coaThirdIn 0.3s ease',
    }}>
      <div style={{ width: 4, background: color }} />
      <div style={{ padding: '5px 10px', flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 8, fontWeight: 700, color, letterSpacing: '0.1em',
          fontFamily: "'Rajdhani', sans-serif", marginBottom: 1,
        }}>{outlet.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#dbe7f5', lineHeight: 1.35 }}>{headline}</div>
      </div>
      <style>{`@keyframes coaThirdIn { from { opacity: 0; transform: translateX(-10px) } to { opacity: 1; transform: translateX(0) } }`}</style>
    </div>
  )
}

export function PhaseChyron({ phase }: { phase: TurnOverlayPhase }) {
  const live = phase === 'poll'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      background: live ? 'rgba(248,113,113,0.14)' : 'rgba(56,189,248,0.1)',
      border: `1px solid ${live ? 'rgba(248,113,113,0.4)' : 'rgba(56,189,248,0.3)'}`,
      borderRadius: 5, padding: '3px 10px',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: live ? '#f87171' : '#38bdf8',
        animation: 'coaPulseSm 1.1s ease-in-out infinite',
      }} />
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
        fontFamily: "'Rajdhani', sans-serif",
        color: live ? '#fca5a5' : '#7dd3fc',
      }}>{PHASE_LABELS[phase]}</span>
      <style>{`@keyframes coaPulseSm { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  )
}
