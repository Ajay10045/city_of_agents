import { useState } from 'react'
import {
  MessageCircle, Loader2, ChevronRight, TrendingUp, TrendingDown,
  Minus, Zap, Shield, AlertTriangle, DollarSign, Users, Newspaper,
  BarChart2, Send, X, CheckCircle
} from 'lucide-react'
import {
  openConsultation, messageMinister, closeConsultation,
  getPolicies, executeTurn,
} from '../api'
import type { GameState, Policy, TurnResult, Minister, GovernanceScorecard } from '../types'

// --------------- Subcomponents ---------------

function ParamBar({ label, value, delta }: { label: string; value: number; delta?: number }) {
  const color = value >= 60 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="group">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-400 capitalize truncate">{label.replace(/_/g, ' ')}</span>
        <div className="flex items-center gap-1.5">
          {delta !== undefined && Math.abs(delta) > 0.05 && (
            <span className={`text-xs ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}
            </span>
          )}
          <span className="text-white font-mono font-semibold">{Math.round(value)}</span>
        </div>
      </div>
      <div className="h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function EventBadge({ name, type, turns }: { name: string; type: string; turns: number }) {
  const isC = type === 'crisis'
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
      isC ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
    }`}>
      {isC ? <AlertTriangle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
      <span className="truncate">{name}</span>
      <span className="opacity-60">{turns}t</span>
    </div>
  )
}

function PolicyCard({ policy, selected, onSelect }: { policy: Policy; selected: boolean; onSelect: () => void }) {
  const topEffect = Object.entries(policy.target_effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-500/10'
          : 'border-[#2a2d3a] bg-[#1a1d26] hover:border-indigo-500/30 hover:bg-[#22263a]'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-white font-semibold text-sm truncate">{policy.name}</p>
          <p className="text-indigo-300 text-xs mt-0.5">{policy.portfolio}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-amber-400 font-semibold text-sm">{Math.round(policy.budget_cost)} Cr</p>
          {selected && <CheckCircle className="w-4 h-4 text-indigo-400 ml-auto mt-1" />}
        </div>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed mb-3 line-clamp-2">{policy.description}</p>
      {topEffect && (
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span className="text-slate-400">{topEffect[0].replace(/_/g, ' ')}</span>
          <span className="text-emerald-400 font-semibold">+{topEffect[1].toFixed(1)}</span>
        </div>
      )}
      <p className="text-slate-500 text-xs mt-2 italic line-clamp-1">{policy.tradeoffs}</p>
    </button>
  )
}

function TurnReportPanel({ result, onClose }: { result: TurnResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#1a1d26] border-b border-[#2a2d3a] px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Turn {result.turn} Report</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Narrative */}
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Delivery Story</p>
            <p className="text-slate-200 text-sm leading-relaxed bg-[#0f1117] rounded-xl p-4 italic">
              "{result.delivery_narrative}"
            </p>
          </div>

          {/* Headlines */}
          {result.media_headlines.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5" /> Media Headlines
              </p>
              <div className="space-y-2">
                {result.media_headlines.map((h, i) => (
                  <div key={i} className={`p-3 rounded-lg text-sm border ${
                    h.lean === 'mayor' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200'
                    : h.lean === 'opposition' ? 'bg-red-500/10 border-red-500/20 text-red-200'
                    : 'bg-[#0f1117] border-[#2a2d3a] text-slate-300'
                  }`}>
                    <span className="opacity-60 text-xs">{h.outlet} · </span>
                    {h.headline}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Citizen voices */}
          {result.citizen_voices.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Citizen Voices
              </p>
              <div className="space-y-2">
                {result.citizen_voices.map((v, i) => (
                  <div key={i} className="bg-[#0f1117] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white text-xs font-semibold">{v.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        v.sentiment === 'approve' ? 'bg-emerald-500/20 text-emerald-400'
                        : v.sentiment === 'disapprove' ? 'bg-red-500/20 text-red-400'
                        : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {v.sentiment}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs">{v.demographics_summary} · {v.ideology}</p>
                    <p className="text-slate-400 text-xs mt-1.5 italic">"{v.reaction}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0f1117] rounded-lg p-3 text-center">
              <p className="text-slate-400 text-xs">Execution</p>
              <p className="text-white font-bold text-lg">{Math.round(result.execution_score * 100)}%</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 text-center">
              <p className="text-slate-400 text-xs">Approval</p>
              <p className="text-white font-bold text-lg">{Math.round(result.interim_approval)}%</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 text-center">
              <p className="text-slate-400 text-xs">Treasury</p>
              <p className="text-white font-bold text-lg">{Math.round(result.treasury_after)} Cr</p>
            </div>
          </div>

          {result.opposition_attack && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-xs font-medium mb-1">Opposition Attack: {result.opposition_attack}</p>
              <p className="text-slate-400 text-xs">Counter: {result.counter_frame}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConsultationPanel({
  ministers,
  gameId,
  onClose,
}: {
  ministers: Minister[]
  gameId: string
  onClose: (hadConsultation: boolean) => void
}) {
  const [selectedMinister, setSelectedMinister] = useState<Minister | null>(null)
  const [messages, setMessages] = useState<{ role: 'user' | 'minister'; text: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [opened, setOpened] = useState(false)

  async function handleSelectMinister(m: Minister) {
    if (opened) {
      // Close current before opening new
      await closeConsultation(gameId)
    }
    setSelectedMinister(m)
    setMessages([])
    setLoading(true)
    try {
      const res = await openConsultation(gameId, m.id)
      setMessages([{ role: 'minister', text: res.reply }])
      setOpened(true)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || !selectedMinister || loading) return
    const msg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const res = await messageMinister(gameId, msg)
      setMessages(prev => [...prev, { role: 'minister', text: res.reply }])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleClose() {
    if (opened) await closeConsultation(gameId)
    onClose(opened)
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-end p-4">
      <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-2xl w-full max-w-lg flex flex-col" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="border-b border-[#2a2d3a] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-indigo-400" />
            <span className="text-white font-semibold text-sm">Minister Consultation</span>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Minister selector */}
        <div className="px-4 py-3 border-b border-[#2a2d3a] shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ministers.map(m => (
              <button
                key={m.id}
                onClick={() => handleSelectMinister(m)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedMinister?.id === m.id
                    ? 'bg-indigo-500 text-white'
                    : 'bg-[#0f1117] text-slate-300 hover:bg-[#22263a] border border-[#2a2d3a]'
                }`}
              >
                <p className="font-semibold">{m.name}</p>
                <p className="opacity-70 mt-0.5">{m.portfolio}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {!selectedMinister && (
            <p className="text-slate-500 text-sm text-center mt-8">Select a minister above to begin consultation</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-[#22263a] text-slate-200 rounded-tl-sm border border-[#2a2d3a]'
              }`}>
                {m.role === 'minister' && selectedMinister && (
                  <p className="text-indigo-400 text-xs font-medium mb-1">{selectedMinister.name}</p>
                )}
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#22263a] border border-[#2a2d3a] px-4 py-2.5 rounded-xl rounded-tl-sm">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        {selectedMinister && (
          <div className="border-t border-[#2a2d3a] px-4 py-3 shrink-0 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={`Ask ${selectedMinister.name}…`}
              className="flex-1 bg-[#0f1117] border border-[#2a2d3a] focus:border-indigo-500/50 rounded-xl px-3.5 py-2 text-white text-sm placeholder-slate-600 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ScorecardScreen({ scorecard }: { scorecard: GovernanceScorecard }) {
  const metrics = [
    { label: 'Final Approval', value: scorecard.final_approval },
    { label: 'Wellbeing Equity', value: scorecard.wellbeing_equity },
    { label: 'Institutional Legacy', value: scorecard.institutional_legacy },
    { label: 'Budget Health', value: scorecard.budget_health },
    { label: 'Crisis Record', value: scorecard.crisis_record },
    { label: 'Promise Delivery', value: scorecard.promise_delivery },
    { label: 'Cabinet Integrity', value: scorecard.cabinet_integrity },
  ]

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-6">
      <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/40 border-b border-[#2a2d3a] p-8 text-center">
          <p className="text-indigo-300 text-sm font-medium mb-2">Game Over — Legacy Title</p>
          <h1 className="text-3xl font-bold text-white mb-1">{scorecard.legacy_title}</h1>
          <p className="text-slate-400 text-sm">{scorecard.summary}</p>
          <div className="mt-6 inline-flex items-center gap-2 bg-white/10 rounded-full px-6 py-3">
            <BarChart2 className="w-5 h-5 text-indigo-300" />
            <span className="text-white text-2xl font-bold">{scorecard.final_score.toFixed(1)}</span>
            <span className="text-slate-400">/ 100</span>
          </div>
        </div>
        <div className="p-6 space-y-3">
          {metrics.map(m => (
            <div key={m.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{m.label}</span>
                <span className="text-white font-semibold">{Math.round(m.value)}</span>
              </div>
              <div className="h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${m.value >= 60 ? 'bg-emerald-500' : m.value >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${m.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --------------- Main Dashboard ---------------

const MINOR_ACTION_OPTIONS = [
  { value: 'banking', label: 'Budget Banking (+20 Cr)' },
  { value: 'maintenance', label: 'Sector Maintenance' },
  { value: 'governance_upkeep', label: 'Governance Upkeep (+1 P11/12/13)' },
  { value: 'press_conference', label: 'Press Conference (+alignment)' },
]

type DashPhase = 'idle' | 'consulting' | 'policies' | 'executing' | 'report' | 'gameover'

interface Props {
  gameId: string
  initialState: GameState
}

export default function GameDashboard({ gameId, initialState }: Props) {
  const [state, setState] = useState<GameState>(initialState)
  const [phase, setPhase] = useState<DashPhase>('idle')
  const [policyOptions, setPolicyOptions] = useState<Policy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<number>(0)
  const [minorActionType, setMinorActionType] = useState('banking')
  const [lastTurnResult, setLastTurnResult] = useState<TurnResult | null>(null)
  const [scorecard, setScorecard] = useState<GovernanceScorecard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [showConsult, setShowConsult] = useState(false)

  const params = state.city_params
  const deltas = lastTurnResult?.actual_deltas ?? {}
  const turnsLeft = state.total_turns - state.current_turn + 1
  const isElectionSoon = state.election_turn - state.current_turn <= 3 && state.current_turn <= state.election_turn

  async function handleGetPolicies() {
    setPhase('policies')
    setError(null)
    try {
      const res = await getPolicies(gameId)
      setPolicyOptions(res.options)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  async function handleExecuteTurn() {
    setIsExecuting(true)
    setPhase('executing')
    setError(null)
    try {
      const res = await executeTurn(gameId, selectedPolicy, { type: minorActionType })
      setState(res.state)
      setLastTurnResult(res.turn_result)
      setPhase('report')
      if (res.game_over) {
        setScorecard(res.scorecard ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('policies')
    } finally {
      setIsExecuting(false)
    }
  }

  function handleCloseReport() {
    if (state.phase === 'game_over' || (state.current_turn > state.total_turns)) {
      setPhase('gameover')
    } else {
      setPhase('idle')
    }
    setPolicyOptions([])
  }

  if (scorecard && phase === 'gameover') {
    return <ScorecardScreen scorecard={scorecard} />
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Top bar */}
      <div className="bg-[#1a1d26] border-b border-[#2a2d3a] px-6 py-3 flex items-center gap-6">
        <div>
          <p className="text-slate-400 text-xs">City</p>
          <p className="text-white font-bold text-sm">{state.city_name}</p>
        </div>
        <div className="h-8 w-px bg-[#2a2d3a]" />
        <div>
          <p className="text-slate-400 text-xs">Turn</p>
          <p className="text-white font-bold text-sm">{state.current_turn} / {state.total_turns}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Phase</p>
          <p className="text-white font-bold text-sm capitalize">{state.phase}</p>
        </div>
        {isElectionSoon && (
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span className="text-amber-300 text-xs font-medium">Election in {state.election_turn - state.current_turn + 1} turns</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <p className="text-slate-400 text-xs">Approval</p>
            <p className={`font-bold text-sm ${state.interim_approval >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
              {Math.round(state.interim_approval)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">Treasury</p>
            <p className="text-white font-bold text-sm">{Math.round(state.treasury)} Cr</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">Debt</p>
            <p className={`font-bold text-sm ${state.outstanding_debt > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {Math.round(state.outstanding_debt)} Cr
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 flex gap-6">
        {/* Left: City Parameters */}
        <div className="w-64 shrink-0 space-y-4">
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">City Parameters</p>
            <div className="space-y-2.5">
              {Object.entries(params).map(([k, v]) => (
                <ParamBar key={k} label={k} value={v} delta={deltas[k]} />
              ))}
            </div>
          </div>

          {/* Active events */}
          {state.active_events.length > 0 && (
            <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Active Events</p>
              <div className="space-y-1.5">
                {state.active_events.map(e => (
                  <EventBadge key={e.id} name={e.name} type={e.type} turns={e.turns_remaining} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Main action area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Cabinet */}
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Cabinet
            </p>
            <div className="flex flex-wrap gap-2">
              {state.ministers.map(m => (
                <div key={m.id} className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2">
                  <p className="text-white text-xs font-semibold">{m.name}</p>
                  <p className="text-slate-400 text-xs">{m.portfolio}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-emerald-400">L:{Math.round(m.loyalty)}</span>
                    {m.scandal_exposure > 30 && (
                      <span className="text-xs text-red-400 flex items-center gap-0.5">
                        <Shield className="w-2.5 h-2.5" />{Math.round(m.scandal_exposure)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Turn phases */}
          {phase === 'idle' && (
            <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-6 flex flex-col items-center justify-center gap-4">
              <p className="text-slate-400 text-sm text-center">
                Turn {state.current_turn} — consult your ministers, then generate policy options.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConsult(true)}
                  className="flex items-center gap-2 bg-[#22263a] hover:bg-[#2a2f4a] border border-[#2a2d3a] text-slate-300 px-4 py-2.5 rounded-xl text-sm transition-all"
                >
                  <MessageCircle className="w-4 h-4 text-indigo-400" />
                  Consult Ministers
                </button>
                <button
                  onClick={handleGetPolicies}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  Generate Policies
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {phase === 'policies' && policyOptions.length === 0 && (
            <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mr-3" />
              <span className="text-slate-400">Generating policy options…</span>
            </div>
          )}

          {phase === 'policies' && policyOptions.length > 0 && (
            <div className="space-y-3">
              <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Choose a Policy</p>
                <div className="grid gap-3">
                  {policyOptions.map((p, i) => (
                    <PolicyCard
                      key={i}
                      policy={p}
                      selected={selectedPolicy === i}
                      onSelect={() => setSelectedPolicy(i)}
                    />
                  ))}
                </div>
              </div>

              {/* Minor action */}
              <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Minor Action</p>
                <div className="grid grid-cols-2 gap-2">
                  {MINOR_ACTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setMinorActionType(opt.value)}
                      className={`px-3 py-2.5 rounded-lg text-xs text-left border transition-all ${
                        minorActionType === opt.value
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-[#2a2d3a] bg-[#0f1117] text-slate-400 hover:border-[#3a3d4a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={handleExecuteTurn}
                disabled={isExecuting}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-semibold rounded-xl px-6 py-3.5 transition-colors"
              >
                {isExecuting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Executing turn…</>
                ) : (
                  <>Execute Turn {state.current_turn} <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          )}

          {/* Last turn summary (compact) */}
          {lastTurnResult && phase === 'idle' && (
            <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Last Turn Summary</p>
                <button
                  onClick={() => setPhase('report')}
                  className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
                >
                  View full report
                </button>
              </div>
              <p className="text-slate-300 text-sm italic leading-relaxed">{lastTurnResult.delivery_narrative.slice(0, 160)}…</p>
              <div className="flex gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <DollarSign className="w-3 h-3" />
                  Tax +{Math.round(lastTurnResult.tax_revenue)} / Interest -{Math.round(lastTurnResult.interest_paid)} Cr
                </div>
                {lastTurnResult.budget_stolen > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    {lastTurnResult.budget_stolen.toFixed(1)} Cr stolen
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Wellbeing + Ward */}
        <div className="w-56 shrink-0 space-y-4">
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Wellbeing</p>
            <div className="text-center mb-3">
              <p className="text-3xl font-bold text-white">{Math.round(state.avg_wellbeing)}</p>
              <p className="text-slate-400 text-xs">avg / 100</p>
            </div>
          </div>

          {/* Communal tension */}
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Communal Tension</p>
            <div className="h-2 bg-[#0f1117] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  state.communal_tension < 40 ? 'bg-emerald-500' : state.communal_tension < 65 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${state.communal_tension}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{Math.round(state.communal_tension)} / 100</p>
          </div>

          {/* Opposition */}
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Opposition</p>
            <div className="h-2 bg-[#0f1117] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500"
                style={{ width: `${state.opposition_credibility}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Credibility: {Math.round(state.opposition_credibility)}</p>
          </div>

          {/* Ward report */}
          {lastTurnResult?.ward_report && lastTurnResult.ward_report.length > 0 && (
            <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Ward Trends</p>
              <div className="space-y-1.5">
                {lastTurnResult.ward_report.slice(0, 6).map((w, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 truncate">{w.group_name}</span>
                    {w.trend === 'up' ? <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                      : w.trend === 'down' ? <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />
                      : <Minus className="w-3 h-3 text-slate-500 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {turnsLeft <= 5 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              <p className="text-amber-300 text-xs font-medium">{turnsLeft} turns remaining</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showConsult && (
        <ConsultationPanel
          ministers={state.ministers}
          gameId={gameId}
          onClose={(_hadConsultation) => setShowConsult(false)}
        />
      )}

      {phase === 'report' && lastTurnResult && (
        <TurnReportPanel result={lastTurnResult} onClose={handleCloseReport} />
      )}
    </div>
  )
}
