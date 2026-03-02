import type { MicroEvent } from '../../types'

export default function HighlightReel({
  lines,
  nearMisses,
  microEvents,
}: {
  lines: string[]
  nearMisses?: string[]
  microEvents?: MicroEvent[]
}) {
  const show = lines.length > 0 ? lines.slice(0, 5) : [
    'What Improved: No major gains this turn.',
    'What Backfired: No severe backlash this turn.',
    'What Decayed: Core systems held steady.',
    'Citizen Voice: "People are waiting for visible delivery."',
    'Potential brewing issue... silent pressure is building in neglected sectors.',
  ]
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1c3652', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>TURN-END HIGHLIGHT REEL</div>
      <div className="space-y-1">
        {show.map((line, i) => (
          <div key={i} style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.5 }}>{line}</div>
        ))}
      </div>
      {(nearMisses?.length ?? 0) > 0 && (
        <div style={{ marginTop: 8 }}>
          {nearMisses?.slice(0, 2).map((n, i) => (
            <div key={i} style={{ fontSize: 10, color: '#f59e0b' }}>Near-miss: {n}</div>
          ))}
        </div>
      )}
      {(microEvents?.length ?? 0) > 0 && (
        <div style={{ marginTop: 8 }}>
          {microEvents?.slice(0, 2).map(ev => (
            <div key={ev.key} style={{ fontSize: 10, color: '#93c5fd' }}>{ev.title}: {ev.narrative}</div>
          ))}
        </div>
      )}
    </div>
  )
}
