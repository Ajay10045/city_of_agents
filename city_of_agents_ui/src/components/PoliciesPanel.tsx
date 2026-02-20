import type { CounterFrameOption, DynamicPolicy } from '../types'

type Props = {
  policies: DynamicPolicy[]
  counterFrames: CounterFrameOption[]
  counterFramesLoading: boolean
  busy: boolean
  loading: boolean
  selectedPolicyId?: string | null
  selectedCounterFrameId?: string | null
  prompt: string
  onSelect: (id: string) => void
  onSelectCounterFrame: (id: string) => void
  onPlaySelected: () => void
  onAskAdvisor?: (id: string) => void
  onReviseOption?: (id: string) => void
  onImpactAssessment?: (id: string) => void
}

function formatStat(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

export default function PoliciesPanel({
  policies,
  counterFrames,
  counterFramesLoading,
  busy,
  loading,
  selectedPolicyId,
  selectedCounterFrameId,
  prompt,
  onSelect,
  onSelectCounterFrame,
  onPlaySelected,
  onAskAdvisor,
  onReviseOption,
  onImpactAssessment,
}: Props) {
  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) ?? null
  const playDisabled = busy || !selectedPolicy || !selectedCounterFrameId

  return (
    <section className="panel" id="policy-section">
      <div className="panel-title">Your Move — Mayor</div>
      <p className="policy-prompt">{prompt}</p>

      <div className="policy-selection-bar">
        <div className="policy-selection-label">
          {selectedPolicy ? `Policy: ${selectedPolicy.name}` : 'Step 1: Select a policy option'}
          {' · '}
          {selectedCounterFrameId ? 'Counter-frame selected' : 'Step 2: Choose a counter-frame'}
        </div>
        <button className="btn-continue policy-play-btn" onClick={onPlaySelected} disabled={playDisabled}>
          {busy ? 'Simulating…' : 'Play Turn'}
        </button>
      </div>

      {selectedPolicy && (
        <div className="counter-frames-panel">
          <div className="counter-frames-title">Counter-Frame (Required)</div>
          {counterFramesLoading ? (
            <div className="muted">Loading counter-frame options…</div>
          ) : (
            <div className="counter-frames-grid">
              {counterFrames.map((frame) => (
                <button
                  key={frame.id}
                  className={`counter-frame-card ${selectedCounterFrameId === frame.id ? 'selected' : ''}`}
                  onClick={() => onSelectCounterFrame(frame.id)}
                  disabled={busy}
                  title={frame.risk ?? ''}
                >
                  <div className="counter-frame-name">{frame.label}</div>
                  <div className="counter-frame-message">{frame.message}</div>
                  {frame.risk && <div className="counter-frame-risk">Risk: {frame.risk}</div>}
                </button>
              ))}
              {!counterFramesLoading && counterFrames.length === 0 && (
                <div className="muted">No counter-frame options available for this policy.</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="policy-grid">
        {loading && <div className="loading-msg">⏳ Consulting advisors…</div>}
        {policies.map((p) => (
          <div
            key={p.id}
            className={`policy-card ${busy ? 'disabled' : ''} ${selectedPolicyId === p.id ? 'selected' : ''}`}
            onClick={() => !busy && onSelect(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (!busy && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onSelect(p.id)
              }
            }}
          >
            {p.rationale && <div className="policy-card-rationale">💡 {p.rationale}</div>}
            {p.why_now && <div className="policy-card-why">Why now: {p.why_now}</div>}

            <div className="policy-card-name">{p.name}</div>
            <div className="policy-card-desc">{p.description}</div>

            {p.effects && Object.keys(p.effects).length > 0 && (
              <div className="policy-effects">
                {Object.entries(p.effects)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 3)
                  .map(([k, v]) => (
                    <div className="policy-effect" key={`${p.id}-${k}`}>
                      <span>{formatStat(k)}</span>
                      <span className={`policy-effect-val ${v > 0 ? 'pos' : 'neg'}`}>
                        {v > 0 ? '+' : ''}
                        {v.toFixed(1)}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {p.group_effects && p.group_effects.length > 0 && (
              <div className="policy-groups">
                {p.group_effects.slice(0, 2).map((ge, idx) => {
                  const who = (ge.match && Object.values(ge.match)[0]) || 'All'
                  const tokens: string[] = []
                  if ((ge.happiness ?? 0) > 0) tokens.push(`↑ ${who}`)
                  if ((ge.happiness ?? 0) < 0) tokens.push(`↓ ${who}`)
                  if ((ge.radicalization ?? 0) > 0) tokens.push(`rad↑ ${who}`)

                  return (
                    <span key={`${p.id}-group-${idx}`}>
                      {tokens.join(' ')}
                      {idx < Math.min(p.group_effects!.length, 2) - 1 ? ' · ' : ''}
                    </span>
                  )
                })}
              </div>
            )}

            <div className="policy-card-actions">
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  onAskAdvisor?.(p.id)
                }}
                disabled={busy}
              >
                Ask Advisor
              </button>
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  onReviseOption?.(p.id)
                }}
                disabled={busy}
              >
                Revise This Option
              </button>
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  onImpactAssessment?.(p.id)
                }}
                disabled={busy}
              >
                Impact Assessment
              </button>
            </div>
          </div>
        ))}
        {!loading && policies.length === 0 && <div className="muted">No policies available.</div>}
      </div>
    </section>
  )
}
