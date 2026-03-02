import type { TurnResult } from '../../types'

export default function PromiseDelivery({ turn }: { turn: TurnResult | null }) {
  if (!turn) return null
  const delivered = Math.max(0, Math.min(100, Math.round(turn.execution_score * 100)))
  const promised = 100
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1c3652', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>PROMISE VS DELIVERY</div>
      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700, marginBottom: 8 }}>{turn.major_policy.name}</div>
      <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>Promised Impact</div>
      <div style={{ height: 7, borderRadius: 4, background: '#0b1929', marginBottom: 8 }}>
        <div style={{ width: `${promised}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#60a5fa,#93c5fd)' }} />
      </div>
      <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>Delivered Impact</div>
      <div style={{ height: 7, borderRadius: 4, background: '#0b1929', marginBottom: 8 }}>
        <div style={{ width: `${delivered}%`, height: '100%', borderRadius: 4, background: delivered >= 60 ? '#22c55e' : delivered >= 40 ? '#f59e0b' : '#ef4444' }} />
      </div>
      <div style={{ fontSize: 11, color: '#f1f5f9' }}>{turn.promise_delivery_line || 'Execution bottlenecks reduced impact.'}</div>
    </div>
  )
}
