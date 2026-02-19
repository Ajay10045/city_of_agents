interface Props {
  label: string
  value: number | string
  unit?: string
  sub?: string
  color?: string
}

export default function MetricCard({ label, value, unit = '', sub, color = 'text-white' }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        {typeof value === 'number' ? value.toFixed(1) : value}{unit}
      </p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}
