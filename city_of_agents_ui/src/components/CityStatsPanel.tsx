type Props = {
  stats: Record<string, number>
  changes?: Record<string, number>
}

const BAD_HIGH = new Set(['corruption', 'social_tension'])

function formatStat(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

const ORDER = [
  'economy',
  'employment',
  'law_and_order',
  'infrastructure',
  'environment',
  'corruption',
  'social_tension',
  'media_freedom',
  'public_trust',
]

function statColor(key: string, value: number) {
  if (BAD_HIGH.has(key)) {
    if (value > 62) return 'danger'
    if (value > 45) return 'warn'
    return 'good'
  }
  if (value > 60) return 'good'
  if (value > 40) return 'warn'
  return 'danger'
}

export default function CityStatsPanel({ stats, changes = {} }: Props) {
  const keys = ORDER.filter((k) => k in stats)

  return (
    <section className="card">
      <h3>City Statistics</h3>
      <div>
        {keys.map((k) => {
          const v = stats[k]
          const delta = changes[k] ?? 0

          return (
          <div key={k} className="stat-row">
            <span className="stat-label">{formatStat(k)}</span>
            <div className="stat-track">
              <div className={`stat-fill ${statColor(k, v)}`} style={{ width: `${v}%` }} />
            </div>
            <span className="stat-value">{Math.round(v)}</span>
            <span className={`stat-delta ${delta > 0.04 ? 'pos' : delta < -0.04 ? 'neg' : ''}`}>
              {delta > 0.04 ? `+${delta.toFixed(1)}` : delta < -0.04 ? delta.toFixed(1) : ''}
            </span>
          </div>
          )
        })}
      </div>
    </section>
  )
}
