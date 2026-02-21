import type { DynamicPolicy } from '../types'

type Props = {
  policies: DynamicPolicy[]
  disabled: boolean
  implementingPolicyId?: string | null
  onImplementPolicy: (policyId: string) => void
}

export default function GeneratedPoliciesPanel({
  policies,
  disabled,
  implementingPolicyId = null,
  onImplementPolicy,
}: Props) {
  return (
    <section className="panel generated-policies-panel" id="generated-policies-panel">
      <div className="panel-title">Generated Policies</div>
      <section className="generated-policy-section">
        <div className="generated-policy-head">
          <strong>Policy Options</strong>
          <span>{policies.length === 0 ? 'No options yet' : `${policies.length} options`}</span>
        </div>
        {policies.length === 0 ? (
          <div className="muted">Ask advisors and click Generate Policy to create options.</div>
        ) : (
          <div className="generated-policy-grid">
            {policies.map((policy) => (
              <article className="generated-policy-card" key={policy.id}>
                <div className="generated-policy-name">{policy.name}</div>
                <div className="generated-policy-description">{policy.description}</div>
                {policy.why_now && <div className="generated-policy-why">Why now: {policy.why_now}</div>}
                {policy.deliberation_trace && (
                  <div className="generated-policy-trace">
                    <div className="generated-policy-trace-title">Council Input</div>
                    {policy.deliberation_trace.mayor_direction_used && (
                      <div className="generated-policy-trace-line">
                        Mayor direction: {policy.deliberation_trace.mayor_direction_used}
                      </div>
                    )}
                    {(policy.deliberation_trace.advisor_inputs_used ?? []).slice(0, 2).map((input, idx) => (
                      <div className="generated-policy-trace-line" key={`${policy.id}-trace-${idx}`}>
                        {input.advisor_name || input.advisor_id} ({input.portfolio}): {input.point}
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn-continue" onClick={() => onImplementPolicy(policy.id)} disabled={disabled}>
                  {implementingPolicyId === policy.id ? 'Implementing…' : 'Implement'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
