import type { StateSnapshot } from '../types'

type Props = {
  state: StateSnapshot
}

function pct(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`
}

export default function TopMetricsPanel({ state }: Props) {
  const popMayor = Math.max(0, Math.min(100, state.mayor_popularity))
  const popOpp = Math.max(0, Math.min(100, 100 - popMayor))

  const mayorCampaign = Math.max(0.01, state.campaign_strength.mayor)
  const oppCampaign = Math.max(0.01, state.campaign_strength.opposition)
  const campaignTotal = mayorCampaign + oppCampaign
  const campaignMayorPct = (mayorCampaign / campaignTotal) * 100
  const campaignOppPct = 100 - campaignMayorPct

  return (
    <section className="panel metrics-ribbon">
      <div className="panel-title">Power Balance</div>

      <div className="metrics-ribbon-row">
        <div className="metrics-ribbon-label">Popularity</div>
        <div className="split-meter">
          <div className="split-meter-left" style={{ width: `${popMayor}%` }} />
          <div className="split-meter-right" style={{ width: `${popOpp}%` }} />
        </div>
        <div className="metrics-ribbon-values">
          <span className="metric-mayor">Mayor {pct(popMayor)}</span>
          <span className="metric-opp">Opp {pct(popOpp)}</span>
        </div>
      </div>

      <div className="metrics-ribbon-row">
        <div className="metrics-ribbon-label">Campaign Strength</div>
        <div className="split-meter">
          <div className="split-meter-left" style={{ width: `${campaignMayorPct}%` }} />
          <div className="split-meter-right" style={{ width: `${campaignOppPct}%` }} />
        </div>
        <div className="metrics-ribbon-values">
          <span className="metric-mayor">Mayor {state.campaign_strength.mayor.toFixed(3)}</span>
          <span className="metric-opp">Opp {state.campaign_strength.opposition.toFixed(3)}</span>
        </div>
      </div>
    </section>
  )
}
