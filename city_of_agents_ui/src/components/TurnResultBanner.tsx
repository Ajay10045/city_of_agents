import type { DynamicPolicy } from '../types'

type Props = {
  visible: boolean
  mayorAction: DynamicPolicy | null
  oppositionAction: DynamicPolicy | null
  triggeredEvents: string[]
}

export default function TurnResultBanner({
  visible,
  mayorAction,
  oppositionAction,
  triggeredEvents,
}: Props) {
  if (!visible) return null

  return (
    <div id="turn-result" className="visible">
      <div className="result-row">
        <div className="result-action">
          <div className="actor">Mayor played</div>
          <div className="name mayor">{mayorAction?.name ?? '—'}</div>
        </div>
        <div className="result-action">
          <div className="actor">Opposition played</div>
          <div className="name opp">{oppositionAction?.name ?? '—'}</div>
        </div>
      </div>

      {triggeredEvents.length > 0 && (
        <div className="result-events">
          {triggeredEvents.map((e) => (
            <span key={e}>⚠ {e}</span>
          ))}
        </div>
      )}

      {oppositionAction?.rationale && <div className="result-opp-rationale">{oppositionAction.rationale}</div>}
    </div>
  )
}
