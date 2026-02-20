import type { DynamicPolicy } from '../types'

type Props = {
  policy: DynamicPolicy | null
  visible: boolean
  onClose: () => void
}

function formatStat(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function classifyEconomicSignal(policy: DynamicPolicy): string {
  const economy = (policy.effects?.economy ?? 0) + (policy.effects?.employment ?? 0)
  if (economy >= 2.0) return 'Broad economic uplift expected in near term.'
  if (economy <= -2.0) return 'Economic stress risk is elevated for vulnerable households.'
  return 'Economic impact is likely mixed and implementation-dependent.'
}

function classifyEmotionalSignal(policy: DynamicPolicy): string {
  const trust = policy.effects?.public_trust ?? 0
  const tension = policy.effects?.social_tension ?? 0
  if (trust > 1 && tension < 0) return 'Likely to reduce anxiety and improve civic confidence.'
  if (trust < -1 || tension > 1) return 'May intensify fear/anger in politically volatile groups.'
  return 'Emotional response likely fragmented across neighborhoods.'
}

export default function PolicyImpactModal({ policy, visible, onClose }: Props) {
  if (!visible || !policy) return null

  const effects = Object.entries(policy.effects ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const expected = Object.entries(policy.expected_stat_delta ?? {})
  const affectedGroups = (policy.group_effects ?? [])
    .slice(0, 6)
    .map((effect) => {
      const match = effect.match ?? {}
      const target = Object.entries(match)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
      const deltas = [
        typeof effect.happiness === 'number' ? `happiness ${effect.happiness >= 0 ? '+' : ''}${effect.happiness.toFixed(1)}` : null,
        typeof effect.radicalization === 'number'
          ? `radicalization ${effect.radicalization >= 0 ? '+' : ''}${effect.radicalization.toFixed(1)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return `${target || 'broad groups'}${deltas ? ` (${deltas})` : ''}`
    })

  return (
    <div className="impact-modal-overlay" role="dialog" aria-modal="true">
      <div className="impact-modal">
        <div className="impact-modal-head">
          <div>
            <div className="panel-title">Impact Assessment</div>
            <h3>{policy.name}</h3>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="impact-description">{policy.description}</p>

        <div className="impact-grid">
          <section>
            <h4>City Stats Impact</h4>
            {effects.length > 0 ? (
              <ul>
                {effects.map(([key, value]) => (
                  <li key={key}>
                    {formatStat(key)}: {value >= 0 ? '+' : ''}
                    {value.toFixed(1)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">No direct city stat deltas declared.</div>
            )}
          </section>

          <section>
            <h4>Expected Outcome</h4>
            {expected.length > 0 ? (
              <ul>
                {expected.map(([key, value]) => (
                  <li key={key}>
                    {formatStat(key)}: {value >= 0 ? '+' : ''}
                    {value.toFixed(1)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">Advisor did not provide expected stat deltas.</div>
            )}
          </section>

          <section>
            <h4>Socio-Economic Pulse</h4>
            <div>{classifyEconomicSignal(policy)}</div>
            <div>{classifyEmotionalSignal(policy)}</div>
          </section>

          <section>
            <h4>Likely Opposition Line</h4>
            <div>{policy.counter_narrative_risk || 'Opposition attack vector not specified.'}</div>
            <div>
              Counter risk:{' '}
              {typeof policy.opposition_counter_risk === 'number'
                ? `${Math.round(policy.opposition_counter_risk * 100)}%`
                : 'n/a'}
            </div>
          </section>
        </div>

        <section className="impact-affected-groups">
          <h4>Affected Population Segments</h4>
          {affectedGroups.length > 0 ? (
            <ul>
              {affectedGroups.map((item, index) => (
                <li key={`affected-${index}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="muted">No explicit group targeting metadata provided.</div>
          )}
        </section>
      </div>
    </div>
  )
}

