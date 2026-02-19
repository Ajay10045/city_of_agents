import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

interface Props {
  stats: Record<string, number>
}

const fmt = (name: string) =>
  name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

const color = (v: number) => {
  if (v < 30) return '#ef4444'
  if (v < 55) return '#f59e0b'
  return '#22c55e'
}

export default function CityStatsChart({ stats }: Props) {
  const data = Object.entries(stats).map(([k, v]) => ({ name: fmt(k), value: v }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">🏙️ Final City Stats</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false} axisLine={false}
          />
          <YAxis
            type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false} axisLine={false} width={80}
          />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: 12 }}
            cursor={{ fill: '#1f2937' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={color(entry.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
