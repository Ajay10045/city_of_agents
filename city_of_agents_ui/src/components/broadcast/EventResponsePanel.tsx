import { useState } from 'react'
import type { EventResponseOption, Minister } from '../../types'

export function EventResponsePanel({
  options, ministers, onSubmit,
}: {
  options: EventResponseOption[]
  ministers: Minister[]
  onSubmit: (responses: { event_id: string; strategy: string; minister_id?: string }[]) => void
}) {
  const [choices, setChoices] = useState<Record<string, { strategy: string; minister_id?: string }>>(() => {
    const init: Record<string, { strategy: string }> = {}
    for (const opt of options) init[opt.event_id] = { strategy: 'none' }
    return init
  })

  return (
    <div style={{
      background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.2)',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12 }}>⚡</span>
        <span style={{
          fontSize: 9, letterSpacing: '0.12em', fontWeight: 700,
          fontFamily: "'Rajdhani', sans-serif", color: '#fbbf24',
        }}>EVENT RESPONSE — CHOOSE YOUR STRATEGY</span>
      </div>
      {options.map(opt => (
        <div key={opt.event_id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 3,
              color: opt.event_type === 'crisis' ? '#f87171' : '#22c55e',
              background: opt.event_type === 'crisis' ? 'rgba(248,113,113,0.1)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${opt.event_type === 'crisis' ? 'rgba(248,113,113,0.3)' : 'rgba(34,197,94,0.3)'}`,
            }}>{opt.event_type}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', fontFamily: "'Rajdhani', sans-serif" }}>
              {opt.event_name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {opt.strategies.map(strat => {
              const selected = choices[opt.event_id]?.strategy === strat.strategy
              const costLabel = strat.cost_treasury ? `${strat.cost_treasury} Cr` : strat.cost_pc ? `${strat.cost_pc} PC` : 'Free'
              return (
                <button key={strat.strategy}
                  onClick={() => setChoices(prev => ({ ...prev, [opt.event_id]: { strategy: strat.strategy } }))}
                  style={{
                    padding: '6px 10px', borderRadius: 6, textAlign: 'left', flex: '1 1 0',
                    border: `1px solid ${selected ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    background: selected ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', transition: 'all 0.15s', minWidth: 120,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: selected ? '#fbbf24' : '#e2e8f0', marginBottom: 2 }}>
                    {strat.label}
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.3, marginBottom: 3 }}>
                    {strat.description}
                  </div>
                  <span style={{
                    fontSize: 8, fontFamily: "'Share Tech Mono', monospace",
                    color: strat.strategy === 'none' ? '#64748b' : '#fbbf24',
                    background: 'rgba(0,0,0,0.2)', borderRadius: 2, padding: '1px 4px',
                  }}>{costLabel}</span>
                </button>
              )
            })}
          </div>
          {choices[opt.event_id]?.strategy === 'assign_minister' && (
            <select
              value={choices[opt.event_id]?.minister_id ?? ''}
              onChange={e => setChoices(prev => ({ ...prev, [opt.event_id]: { ...prev[opt.event_id], minister_id: e.target.value } }))}
              style={{
                marginTop: 6, width: '100%', padding: '5px 8px', borderRadius: 4,
                background: '#0a1828', border: '1px solid #1c3652', color: '#e2e8f0',
                fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              <option value="">Select a minister...</option>
              {ministers.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {m.portfolio}</option>
              ))}
            </select>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          const responses = Object.entries(choices).map(([event_id, c]) => ({
            event_id,
            strategy: c.strategy,
            ...(c.minister_id ? { minister_id: c.minister_id } : {}),
          }))
          onSubmit(responses)
        }}
        style={{
          width: '100%', padding: '8px 14px', borderRadius: 6, marginTop: 4,
          background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
          border: '1px solid #f59e0b', color: '#fff', fontWeight: 700, fontSize: 11,
          letterSpacing: '0.08em', cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif",
        }}
      >
        SUBMIT RESPONSES
      </button>
    </div>
  )
}
