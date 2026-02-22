import { useState } from 'react'
import type { DeliveryReport, DynamicPolicy } from '../types'
import PolicyDetailsDrawer from './PolicyDetailsDrawer'

type Props = {
  policies: DynamicPolicy[]
  disabled: boolean
  implementingPolicyId?: string | null
  onImplementPolicy: (policyId: string) => void
  deliveryReport?: DeliveryReport | null
  implementedPolicyName?: string | null
}

function executionStatus(ratio: number): { label: string; className: string } {
  const pct = Math.round(ratio * 100)
  if (ratio >= 0.8) return { label: `Delivered (${pct}%)`, className: 'execution-status-delivered' }
  if (ratio >= 0.4) return { label: `Partial (${pct}%)`, className: 'execution-status-partial' }
  return { label: `Failed (${pct}%)`, className: 'execution-status-failed' }
}

function fmtCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(0)
}

export default function GeneratedPoliciesPanel({
  policies,
  disabled,
  implementingPolicyId = null,
  onImplementPolicy,
  deliveryReport = null,
  implementedPolicyName = null,
}: Props) {
  const [drawerPolicy, setDrawerPolicy] = useState<DynamicPolicy | null>(null)

  const showExecutionReport = policies.length === 0 && deliveryReport !== null

  return (
    <section className="panel generated-policies-panel" id="generated-policies-panel">
      <div className="panel-title">Generated Policies</div>

      {showExecutionReport ? (
        <div className="execution-report">
          <div className="execution-report-header">
            <strong>{implementedPolicyName ?? 'Policy'} — Execution Report</strong>
            <div className="execution-report-summary">
              <span>Completion {((deliveryReport.execution_score ?? 0) * 100).toFixed(1)}%</span>
              <span>Gap {((deliveryReport.implementation_gap ?? 0) * 100).toFixed(1)}%</span>
              <span>Budget {fmtCompact(deliveryReport.budget_spent ?? 0)} / {fmtCompact(deliveryReport.budget_required ?? 0)}</span>
            </div>
          </div>

          {deliveryReport.targets.length > 0 && (
            <div className="execution-report-table">
              <div className="execution-report-row execution-report-head">
                <span>Task</span>
                <span>Promised</span>
                <span>Delivered</span>
                <span>Status</span>
              </div>
              {deliveryReport.targets.map((target, index) => {
                const status = executionStatus(target.completion_ratio)
                return (
                  <div className="execution-report-row" key={`exec-${index}-${target.key}`}>
                    <span>{target.label}</span>
                    <span>{target.proposed} {target.unit}</span>
                    <span>{target.delivered.toFixed(1)} {target.unit}</span>
                    <span className={status.className}>{status.label}</span>
                  </div>
                )
              })}
            </div>
          )}

          {deliveryReport.summary && (
            <div className="execution-summary">{deliveryReport.summary}</div>
          )}
        </div>
      ) : (
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
                  <div className="policy-card-actions">
                    <button className="btn-ghost" onClick={() => setDrawerPolicy(policy)}>
                      View Details
                    </button>
                    <button className="btn-continue" onClick={() => onImplementPolicy(policy.id)} disabled={disabled}>
                      {implementingPolicyId === policy.id ? 'Implementing…' : 'Implement'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <PolicyDetailsDrawer
        policy={drawerPolicy}
        visible={drawerPolicy !== null}
        onClose={() => setDrawerPolicy(null)}
      />
    </section>
  )
}
