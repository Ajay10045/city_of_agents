import type { StateSnapshot } from '../types'

type PanelKey = 'popularity' | 'campaign' | 'media'

type Props = {
  state: StateSnapshot
  panels?: PanelKey[]
  horizontal?: boolean
  className?: string
}

export default function SidebarPanels({
  state,
  panels = ['popularity', 'campaign', 'media'],
  horizontal = false,
  className,
}: Props) {
  const mayor = state.mayor_popularity
  const opp = state.opposition_popularity
  const sens = state.media_state.sensationalism
  const trust = state.media_state.trust
  const biasPos = ((state.media_state.bias + 50) / 100) * 100
  const biasLabel = state.media_state.bias > 2 ? 'Mayor' : state.media_state.bias < -2 ? 'Opp' : 'Neutral'

  return (
    <aside className={`sidebar-panels ${horizontal ? 'horizontal' : 'vertical'} ${className ?? ''}`.trim()}>
      {panels.includes('popularity') && (
        <div className="panel">
          <div className="panel-title">Popularity</div>
          <div className="pop-row">
            <span className="pop-label">Mayor</span>
            <div className="pop-track"><div className="pop-fill mayor" style={{ width: `${mayor}%` }} /></div>
            <span className="pop-value mayor">{mayor.toFixed(1)}%</span>
          </div>
          <div className="pop-row">
            <span className="pop-label">Opp</span>
            <div className="pop-track"><div className="pop-fill opp" style={{ width: `${opp}%` }} /></div>
            <span className="pop-value opp">{opp.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {panels.includes('campaign') && (
        <div className="panel">
          <div className="panel-title">Campaign Strength</div>
          <div className="campaign-row"><span>Mayor</span><span>{state.campaign_strength.mayor.toFixed(3)}</span></div>
          <div className="campaign-row"><span>Opposition</span><span>{state.campaign_strength.opposition.toFixed(3)}</span></div>
          <div className="campaign-row">
            <span>Credibility</span>
            <span className={state.last_credibility_delta < 0 ? 'cred-bad' : 'cred-good'}>
              {state.credibility_score.toFixed(1)} ({state.last_credibility_delta > 0 ? '+' : ''}
              {state.last_credibility_delta.toFixed(1)})
            </span>
          </div>
          <div className="campaign-row"><span>Open Promises</span><span>{state.open_promises}</span></div>
        </div>
      )}

      {panels.includes('media') && (
        <div className="panel">
          <div className="panel-title">Media Conditions</div>
          <div className="media-row">
            <span className="media-label">Bias</span>
            <div className="bias-track">
              <div className="bias-center" />
              <div className="bias-dot" style={{ left: `${biasPos}%` }} />
            </div>
            <span className="media-val">{biasLabel}</span>
          </div>
          <div className="media-row">
            <span className="media-label">Sensational</span>
            <div className="media-track"><div className="media-fill" style={{ width: `${sens}%`, background: sens > 65 ? 'var(--red)' : sens > 40 ? 'var(--yellow)' : 'var(--green)' }} /></div>
            <span className="media-val">{Math.round(sens)}</span>
          </div>
          <div className="media-row">
            <span className="media-label">Trust</span>
            <div className="media-track"><div className="media-fill" style={{ width: `${trust}%`, background: 'var(--green)' }} /></div>
            <span className="media-val">{Math.round(trust)}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
