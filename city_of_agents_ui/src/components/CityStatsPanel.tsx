type Props = {
  stats: Record<string, number>
  changes?: Record<string, number>
}

const BAD_HIGH = new Set(['pollution_levels', 'recidivism_rate'])

function formatStat(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

type Pillar = {
  label: string
  keys: string[]
}

const PILLARS: Pillar[] = [
  { label: 'Wealth', keys: ['treasury_balance', 'employment_rate', 'avg_wage'] },
  { label: 'Health', keys: ['hospital_capacity', 'pollution_levels', 'food_supply'] },
  { label: 'Safety', keys: ['police_coverage', 'recidivism_rate', 'lighting_level'] },
  { label: 'Social', keys: ['park_density', 'connectivity', 'media_access'] },
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

function pillarAverage(keys: string[], stats: Record<string, number>): number {
  const present = keys.filter((k) => k in stats)
  if (present.length === 0) return 0
  const sum = present.reduce((acc, k) => {
    const v = stats[k]
    return acc + (BAD_HIGH.has(k) ? 100 - v : v)
  }, 0)
  return sum / present.length
}

export default function CityStatsPanel({ stats, changes = {} }: Props) {
  return (
    <section className="card">
      <h3>City Statistics</h3>
      <div className="city-stats-pillars">
        {PILLARS.map((pillar) => {
          const keys = pillar.keys.filter((k) => k in stats)
          if (keys.length === 0) return null
          const avg = pillarAverage(pillar.keys, stats)
          return (
            <div key={pillar.label} className="city-stats-pillar">
              <div className="pillar-header">
                <span className="pillar-label">{pillar.label}</span>
                <span className={`pillar-avg ${statColor('', avg)}`}>{Math.round(avg)}</span>
              </div>
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
          )
        })}
      </div>
    </section>
  )
}
