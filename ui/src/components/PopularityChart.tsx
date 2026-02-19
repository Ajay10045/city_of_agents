import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TurnData } from '../types'

interface Props {
  turns: TurnData[]
  electionTurn?: number
}

export default function PopularityChart({ turns, electionTurn }: Props) {
  const data = [
    { turn: 0, Mayor: 50, Opposition: 50 },
    ...turns.map(t => ({
      turn: t.turn,
      Mayor: t.mayor_popularity,
      Opposition: t.opposition_popularity,
    })),
  ]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">📈 Popularity Over Time</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="turn" tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false} axisLine={false}
          />
          <YAxis
            domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false} axisLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {electionTurn && (
            <ReferenceLine x={electionTurn} stroke="#facc15" strokeDasharray="4 2"
              label={{ value: '🗳️', position: 'top', fontSize: 12 }} />
          )}
          <ReferenceLine y={50} stroke="#374151" strokeDasharray="3 3" />
          <Line
            type="monotone" dataKey="Mayor" stroke="#7c3aed"
            strokeWidth={2} dot={false} activeDot={{ r: 4 }}
          />
          <Line
            type="monotone" dataKey="Opposition" stroke="#ea580c"
            strokeWidth={2} dot={false} activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
