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

  return (
    <section className="panel metrics-ribbon">
      <div className="panel-title">Power Balance</div>

      <div className="popularity-layout">
        <span className="pop-side-label metric-mayor">Mayor</span>
        <div className="pop-center-col">
          <div className="metrics-ribbon-label metrics-ribbon-label-centered">Popularity</div>
          <div className="split-meter split-meter-with-inside-values">
            <div className="split-meter-left" style={{ width: `${popMayor}%` }} />
            <div className="split-meter-right" style={{ width: `${popOpp}%` }} />
            <div className="split-meter-inside-values split-meter-inside-pcts" aria-hidden="true">
              <span>{pct(popMayor)}</span>
              <span>{pct(popOpp)}</span>
            </div>
          </div>
        </div>
        <span className="pop-side-label metric-opp">Opposition</span>
      </div>
    </section>
  )
}
