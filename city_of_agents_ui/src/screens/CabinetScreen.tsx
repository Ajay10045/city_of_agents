import { useState, useEffect } from 'react'
import { Users, ChevronRight, Loader2, Star, Shield, Briefcase, AlertTriangle, Check } from 'lucide-react'
import { getMinisterCandidates, assignCabinet } from '../api'
import type { Citizen, GameState } from '../types'

const PORTFOLIOS = [
  'Infrastructure',
  'Health & Education',
  'Finance & Economy',
  'Home Affairs',
  'Housing & Community',
]

interface Props {
  gameId: string
  state: GameState
  onCabinetFormed: (state: GameState) => void
}

interface Assignment {
  portfolio: string
  citizen: Citizen | null
}

function StatBar({ value, color = 'indigo' }: { value: number; color?: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
  }
  const bar = colors[color] ?? colors.indigo
  return (
    <div className="h-1 bg-[#0f1117] rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function CandidateCard({
  citizen,
  selected,
  assignedTo,
  onSelect,
}: {
  citizen: Citizen
  selected: boolean
  assignedTo: string | null
  onSelect: () => void
}) {
  const cap = citizen.capability
  const per = citizen.personality
  const comp = cap.competence ?? 50
  const loyalty = per.integrity ?? 50
  const ambition = per.ambition ?? 50

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-500/10'
          : assignedTo
          ? 'border-[#2a2d3a] bg-[#1a1d26]/50 opacity-50 cursor-not-allowed'
          : 'border-[#2a2d3a] bg-[#1a1d26] hover:border-indigo-500/40 hover:bg-[#22263a]'
      }`}
      disabled={!!assignedTo && !selected}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-white font-semibold text-sm">{citizen.name}</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {citizen.demographics.profession} · {citizen.demographics.location}
          </p>
        </div>
        {assignedTo && (
          <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
            {assignedTo}
          </span>
        )}
        {selected && (
          <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Ideology tags */}
      <div className="flex gap-1.5 mb-3">
        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
          {citizen.demographics.ideology_economic}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
          {citizen.demographics.ideology_social}
        </span>
      </div>

      {/* Stats */}
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-slate-400 flex items-center gap-1"><Star className="w-3 h-3" />Competence</span>
            <span className="text-slate-300">{Math.round(comp)}</span>
          </div>
          <StatBar value={comp} color={comp >= 65 ? 'green' : comp >= 45 ? 'amber' : 'red'} />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-slate-400 flex items-center gap-1"><Shield className="w-3 h-3" />Integrity</span>
            <span className="text-slate-300">{Math.round(loyalty)}</span>
          </div>
          <StatBar value={loyalty} color={loyalty >= 65 ? 'green' : loyalty >= 45 ? 'amber' : 'red'} />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-slate-400 flex items-center gap-1"><Briefcase className="w-3 h-3" />Ambition</span>
            <span className="text-slate-300">{Math.round(ambition)}</span>
          </div>
          <StatBar value={ambition} color="purple" />
        </div>
      </div>
    </button>
  )
}

export default function CabinetScreen({ gameId, state, onCabinetFormed }: Props) {
  const [candidates, setCandidates] = useState<Citizen[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // assignments[portfolioIndex] = selected citizen | null
  const [assignments, setAssignments] = useState<Assignment[]>(
    PORTFOLIOS.map(p => ({ portfolio: p, citizen: null }))
  )
  const [activeSlot, setActiveSlot] = useState<number>(0)

  useEffect(() => {
    getMinisterCandidates(gameId)
      .then(res => {
        setCandidates(res.candidates)
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [gameId])

  function getAssignedPortfolio(citizenId: string): string | null {
    const slot = assignments.find(a => a.citizen?.id === citizenId)
    return slot?.portfolio ?? null
  }

  function selectCandidate(citizen: Citizen) {
    const alreadyAssigned = getAssignedPortfolio(citizen.id)
    if (alreadyAssigned) return // can't pick someone already assigned elsewhere

    setAssignments(prev => prev.map((a, i) =>
      i === activeSlot ? { ...a, citizen } : a
    ))
    // Move to next empty slot
    const nextEmpty = assignments.findIndex((a, i) => i !== activeSlot && !a.citizen)
    if (nextEmpty !== -1) setActiveSlot(nextEmpty)
  }

  function clearSlot(idx: number) {
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, citizen: null } : a))
    setActiveSlot(idx)
  }

  const allFilled = assignments.every(a => a.citizen !== null)

  async function handleConfirm() {
    if (!allFilled) return
    setSubmitting(true)
    setError(null)
    try {
      const assignmentPayload = assignments.map(a => ({
        citizen_id: a.citizen!.id,
        portfolio: a.portfolio,
      }))
      await assignCabinet(gameId, assignmentPayload)
      // Get updated state
      const updatedState = { ...state, ministers: assignments.map(a => ({
        ...a.citizen!,
        portfolio: a.portfolio,
        extra_portfolios: [],
        loyalty: 65,
        scandal_exposure: 0,
        political_capital: 50,
      })) } as GameState
      onCabinetFormed(updatedState)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3" />
          <p className="text-slate-400">Finding cabinet candidates…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <div className="border-b border-[#2a2d3a] bg-[#1a1d26] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Users className="w-4 h-4 text-indigo-400" />
              <span className="text-indigo-300 text-sm font-medium">Cabinet Formation</span>
            </div>
            <h1 className="text-xl font-bold text-white">{state.city_name}</h1>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">Slots filled</p>
            <p className="text-white font-bold">{assignments.filter(a => a.citizen).length} / {PORTFOLIOS.length}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-6xl mx-auto w-full p-6 flex gap-6">
        {/* Left: Portfolio slots */}
        <div className="w-72 shrink-0">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Portfolios</p>
          <div className="space-y-2">
            {assignments.map((a, idx) => (
              <button
                key={a.portfolio}
                onClick={() => setActiveSlot(idx)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  activeSlot === idx
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-[#2a2d3a] bg-[#1a1d26] hover:border-[#3a3d4a]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">{a.portfolio}</p>
                    {a.citizen ? (
                      <p className="text-indigo-300 text-xs mt-0.5">{a.citizen.name}</p>
                    ) : (
                      <p className="text-slate-500 text-xs mt-0.5 italic">Empty — select below</p>
                    )}
                  </div>
                  {a.citizen && (
                    <button
                      onClick={e => { e.stopPropagation(); clearSlot(idx) }}
                      className="text-slate-500 hover:text-red-400 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={!allFilled || submitting}
            className="w-full mt-6 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 transition-colors text-sm"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Forming Cabinet…</>
            ) : (
              <><ChevronRight className="w-4 h-4" /> Confirm Cabinet</>
            )}
          </button>

          {!allFilled && (
            <div className="mt-3 flex items-start gap-2 text-amber-400/80">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p className="text-xs">All {PORTFOLIOS.length} portfolios must be filled before proceeding.</p>
            </div>
          )}
        </div>

        {/* Right: Candidates */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
              Candidates — selecting for: <span className="text-indigo-300">{assignments[activeSlot].portfolio}</span>
            </p>
            <p className="text-slate-500 text-xs">{candidates.length} candidates available</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {candidates.map(c => (
              <CandidateCard
                key={c.id}
                citizen={c}
                selected={assignments[activeSlot].citizen?.id === c.id}
                assignedTo={getAssignedPortfolio(c.id)}
                onSelect={() => selectCandidate(c)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
