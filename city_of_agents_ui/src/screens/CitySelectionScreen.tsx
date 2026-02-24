import { useState } from 'react'
import { Globe, Loader2, ChevronRight, MapPin } from 'lucide-react'
import { generateProfile, newGame } from '../api'
import type { GameState } from '../types'

interface Props {
  onGameCreated: (gameId: string, state: GameState, profile: Record<string, unknown>) => void
}

const PRESET_CITIES = [
  { label: 'Lagos, Nigeria', hint: 'Lagos, Nigeria — a sprawling coastal megacity with booming commerce and stark inequality' },
  { label: 'Lahore, Pakistan', hint: 'Lahore, Pakistan — a historic Mughal city with a large working class and cultural richness' },
  { label: 'Medellín, Colombia', hint: 'Medellín, Colombia — a transforming city with a past of violence, now a hub of innovation' },
  { label: 'Dhaka, Bangladesh', hint: 'Dhaka, Bangladesh — a densely packed river delta city with garment industry dominance' },
  { label: 'Nairobi, Kenya', hint: 'Nairobi, Kenya — a regional tech hub with deep urban-rural divides' },
  { label: 'Kathmandu, Nepal', hint: 'Kathmandu, Nepal — a mountain capital balancing tourism, heritage, and development' },
]

type Phase = 'input' | 'generating' | 'preview'

export default function CitySelectionScreen({ onGameCreated }: Props) {
  const [hint, setHint] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [isStarting, setIsStarting] = useState(false)
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!hint.trim()) return
    setPhase('generating')
    setError(null)
    try {
      const p = await generateProfile(hint.trim())
      setProfile(p)
      setPhase('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('input')
    }
  }

  async function handleStart() {
    if (!profile) return
    setIsStarting(true)
    setError(null)
    try {
      const result = await newGame(profile)
      onGameCreated(result.game_id, result.state, profile)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setIsStarting(false)
    }
  }

  const cityParams = profile ? (profile.city_parameters as Record<string, number>) : null
  const cityName = profile ? String(profile.city_name ?? '') : ''
  const region = profile ? String(profile.region ?? '') : ''
  const popDesc = profile ? String(profile.population_description ?? '') : ''
  const culturalNotes = profile ? String(profile.cultural_notes ?? '') : ''

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-1.5 mb-4">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span className="text-indigo-300 text-sm font-medium">City of Agents</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">Choose Your City</h1>
        <p className="text-slate-400 text-lg max-w-lg mx-auto">
          Select a real city or describe one. The AI will generate a detailed,
          realistic governance profile for your play-through.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-2xl">
        {(phase === 'input' || phase === 'generating') && (
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-2xl p-8">
            {/* Presets */}
            <p className="text-slate-400 text-sm font-medium mb-3">Quick select</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {PRESET_CITIES.map(c => (
                <button
                  key={c.label}
                  onClick={() => setHint(c.hint)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#22263a] hover:bg-[#2a2f4a] border border-[#2a2d3a] hover:border-indigo-500/40 text-slate-300 text-sm text-left transition-all"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  {c.label}
                </button>
              ))}
            </div>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#2a2d3a]" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#1a1d26] px-3 text-slate-500 text-xs">or describe your city</span>
              </div>
            </div>

            <textarea
              value={hint}
              onChange={e => setHint(e.target.value)}
              rows={3}
              placeholder="e.g. 'A mid-sized port city in Vietnam with a young population and rapid industrialisation...'"
              className="w-full bg-[#0f1117] border border-[#2a2d3a] focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 resize-none outline-none transition-colors text-sm"
            />

            {error && (
              <p className="text-red-400 text-sm mt-2">{error}</p>
            )}

            <button
              onClick={handleGenerate}
              disabled={!hint.trim() || phase === 'generating'}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-6 py-3 transition-colors"
            >
              {phase === 'generating' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating city profile…
                </>
              ) : (
                <>
                  Generate City Profile
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {phase === 'preview' && profile && cityParams && (
          <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-2xl overflow-hidden">
            {/* City header */}
            <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/30 border-b border-[#2a2d3a] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{cityName}</h2>
                  <p className="text-slate-400 text-sm mt-0.5">{region}</p>
                </div>
                <button
                  onClick={() => { setProfile(null); setPhase('input') }}
                  className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
                >
                  Change city
                </button>
              </div>
              <p className="text-slate-300 text-sm mt-3 leading-relaxed">{popDesc}</p>
              {culturalNotes && (
                <p className="text-slate-400 text-xs mt-2 italic">{culturalNotes}</p>
              )}
            </div>

            {/* Parameters grid */}
            <div className="p-6">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">Starting City Parameters</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {Object.entries(cityParams).map(([key, val]) => (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-400 text-xs capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className={`text-xs font-mono font-bold ${val >= 60 ? 'text-emerald-400' : val >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {Math.round(val)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${val >= 60 ? 'bg-emerald-500' : val >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Budget preview */}
            {profile.budget ? (() => {
              const b = profile.budget as Record<string, number>
              return (
                <div className="border-t border-[#2a2d3a] px-6 py-4 flex gap-6">
                  <div>
                    <p className="text-slate-500 text-xs">Starting Treasury</p>
                    <p className="text-white font-semibold">{Math.round(b.starting_treasury)} Cr</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Tax Revenue / Turn</p>
                    <p className="text-white font-semibold">~{Math.round(b.base_tax_revenue)} Cr</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Max Policy Budget</p>
                    <p className="text-white font-semibold">{Math.round(b.max_policy_budget)} Cr</p>
                  </div>
                </div>
              )
            })() : null}

            {error && (
              <p className="text-red-400 text-sm px-6 pb-2">{error}</p>
            )}

            <div className="border-t border-[#2a2d3a] p-6">
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-semibold rounded-xl px-6 py-3 transition-colors"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating citizens & cabinet…
                  </>
                ) : (
                  <>
                    Start as Mayor
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
