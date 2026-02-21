export type StreamCardItem = {
  kind: 'mayor' | 'opposition' | 'event' | 'impact' | 'media'
  turn?: number
  label: string
  name: string
  description?: string
  rationale?: string
  meta?: string
}

type Props = {
  items: StreamCardItem[]
  visible: boolean
}

export default function StreamFeedPanel({ items, visible }: Props) {
  return (
    <section className="panel" id="stream-panel">
      <div className="panel-title">Turn Feed + Log</div>
      {!visible || items.length === 0 ? (
        <div className="muted">No streamed updates yet.</div>
      ) : (
        <div className="stream-list">
          {items.map((item, i) => {
            const headline =
              item.name?.trim() || item.description?.trim() || item.meta?.trim() || item.label
            const description =
              item.description && item.description.trim() !== headline ? item.description : undefined
            const meta =
              item.meta && item.meta.trim() !== headline && item.meta.trim() !== description
                ? item.meta
                : undefined
            return (
              <div key={i} className={`stream-card fade-in stream-${item.kind}`}>
                <div className="stream-card-label-row">
                  <div className="stream-card-label">{item.label}</div>
                  {typeof item.turn === 'number' && <div className="stream-turn-tag">T{item.turn}</div>}
                </div>
                <div className="stream-card-name">{headline}</div>
                {description && <div className="stream-card-desc">{description}</div>}
                {item.rationale && <div className="stream-card-rationale">💡 {item.rationale}</div>}
                {meta && <div className="stream-card-meta">{meta}</div>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
