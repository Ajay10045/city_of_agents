import type { DynamicPolicy } from '../types'

type Props = {
  policy: DynamicPolicy | null
  visible: boolean
  onClose: () => void
}

export default function PolicyDetailsDrawer({ policy, visible, onClose }: Props) {
  if (!visible || !policy) return null

  const targets = policy.implementation_targets ?? []

  return (
    <div className="policy-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="policy-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="policy-drawer-head">
          <div>
            <div className="panel-title">Promises & Tasks</div>
            <h3>{policy.name}</h3>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <section className="policy-drawer-section">
          {targets.length === 0 ? (
            <div className="muted">No explicit task targets were provided.</div>
          ) : (
            <div className="policy-target-table">
              <div className="policy-target-row policy-target-head">
                <span>Target</span>
                <span>Promised</span>
                <span>Difficulty</span>
              </div>
              {targets.map((target, index) => (
                <div className="policy-target-row" key={`${policy.id}-target-${index}`}>
                  <span>{target.label}</span>
                  <span>{target.proposed} {target.unit}</span>
                  <span>{typeof target.difficulty === 'number' ? target.difficulty.toFixed(2) : 'n/a'}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
