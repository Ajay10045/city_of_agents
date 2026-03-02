import type { Minister } from '../../types'

function portrait(name: string, ageGroup?: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  h = Math.abs(h)
  const gender = h % 2 === 0 ? 'female' : 'male'
  let age = 'mid'
  if (ageGroup && /(18|25|26|35)/.test(ageGroup)) age = 'young'
  if (ageGroup && /(51|65|\+)/.test(ageGroup)) age = 'old'
  const variant = age === 'old' ? 1 : ((h >> 1) % 2) + 1
  return `/agents/generic/generic_${gender}_${age}_${variant}.png`
}

function moodColor(m: Minister) {
  if (m.mood_state === 'exposed') return '#ef4444'
  if (m.mood_state === 'stressed') return '#f59e0b'
  return '#22c55e'
}

export default function MinisterMoodStrip({
  ministers,
  selectedId,
  onSelect,
}: {
  ministers: Minister[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {ministers.slice(0, 5).map(m => {
        const halo = moodColor(m)
        const selected = selectedId === m.id
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`rounded-md px-2 py-2 text-left ${m.mood_flicker ? 'coa-flicker' : ''}`}
            style={{
              background: selected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selected ? halo : '#1c3652'}`,
            }}
          >
            <div className="flex items-center gap-2">
              <img
                src={portrait(m.name, m.demographics?.age_group)}
                alt={m.name}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '999px',
                  border: `1px solid ${halo}`,
                  boxShadow: `0 0 10px ${halo}99`,
                }}
              />
              <div className="min-w-0">
                <div className="truncate" style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 700 }}>{m.name}</div>
                <div className="truncate" style={{ fontSize: 9, color: halo }}>{m.portfolio}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
