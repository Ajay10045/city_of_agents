import { useState, useRef, type ReactNode } from 'react'
import { Loader2, Play, Users, Banknote, AlertCircle, X, ChevronLeft, ChevronRight, BookOpen, MapPin, Newspaper, FileText, BarChart3, Award } from 'lucide-react'
import { generateProfile, newGame } from '../api'
import type { GameState } from '../types'

interface Props {
  onGameCreated: (gameId: string, state: GameState, profile: Record<string, unknown>) => void
}

const PRESET_CITIES = [
  {
    id: 'delhi',
    name: 'New Delhi',
    image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?q=80&w=800&auto=format&fit=crop',

    budgetStr: '$9.2B',
    issues: [{ label: 'Traffic Congestion', color: 'bg-amber-500' }, { label: 'Pollution', color: 'bg-red-500' }, { label: 'Income Gap', color: 'bg-blue-500' }],
    hint: 'New Delhi, India — a massive capital with extreme wealth disparity, deep administrative complexity, and severe pollution issues.'
  },
  {
    id: 'dubai',
    name: 'Dubai',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=800&auto=format&fit=crop',

    budgetStr: '$21.5B',
    issues: [{ label: 'Cost of Living', color: 'bg-amber-500' }, { label: 'Labor Rights', color: 'bg-red-500' }],
    hint: 'Dubai, UAE — an ultra-modern desert metropolis known for luxury commerce, rapid development, and a massive expatriate workforce.'
  },
  {
    id: 'london',
    name: 'London',
    image: 'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?q=80&w=800&auto=format&fit=crop',

    budgetStr: '$25.0B',
    issues: [{ label: 'Housing Costs', color: 'bg-red-500' }, { label: 'Transit Delays', color: 'bg-amber-500' }, { label: 'Economic Pressure', color: 'bg-blue-500' }],
    hint: 'London, UK — a historic global financial hub balancing immense cultural heritage with intense modern infrastructure and housing pressures.'
  },
  {
    id: 'new_york',
    name: 'New York',
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=800&auto=format&fit=crop',

    budgetStr: '$107.0B',
    issues: [{ label: 'Inequality', color: 'bg-red-500' }, { label: 'Aging Infrastructure', color: 'bg-amber-500' }],
    hint: 'New York City, USA — a dense, iconic metropolis driven by commerce and culture, facing extreme housing costs and aging transit.'
  },
  {
    id: 'san_francisco',
    name: 'San Francisco',
    image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=800&auto=format&fit=crop',

    budgetStr: '$14.6B',
    issues: [{ label: 'Homelessness', color: 'bg-red-500' }, { label: 'Affordability', color: 'bg-red-500' }],
    hint: 'San Francisco, USA — a major tech and innovation center struggling with a severe housing affordability crisis and stark visible inequality.'
  },
]

export default function CitySelectionScreen({ onGameCreated }: Props) {
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [turnsToElection, setTurnsToElection] = useState(5)
  const [populationStr, setPopulationStr] = useState("10")

  const [challengeMode, setChallengeMode] = useState<'standard' | 'reformist' | 'populist' | 'fiscal_hawk'>('standard')
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHowToPlay, setShowHowToPlay] = useState(false)

  const CHALLENGE_MODES: { id: 'standard' | 'reformist' | 'populist' | 'fiscal_hawk'; label: string; desc: string; color: string }[] = [
    { id: 'standard',    label: 'STANDARD',     desc: 'Balanced gameplay',                     color: '#64748b' },
    { id: 'reformist',   label: 'REFORMIST',    desc: 'Tight budget, reform pressure',          color: '#818cf8' },
    { id: 'populist',    label: 'POPULIST',     desc: 'High start approval, volatile',          color: '#fb923c' },
    { id: 'fiscal_hawk', label: 'FISCAL HAWK',  desc: 'Strict budget cap, loyalty at stake',    color: '#f87171' },
  ]

  async function handleStartGame() {
    if (!selectedCityId) return
    const city = PRESET_CITIES.find(c => c.id === selectedCityId)
    if (!city) return

    setIsStarting(true)
    setError(null)

    try {
      // 1. Generate profile from hint
      const profile = await generateProfile(city.hint)
      const mutableProfile = profile as Record<string, unknown> & {
        game_config?: { total_turns?: number; election_turn?: number }
      }

      // Override game config based on sliders
      if (mutableProfile.game_config) {
        mutableProfile.game_config.total_turns = turnsToElection
        mutableProfile.game_config.election_turn = Math.max(3, turnsToElection - 1)
      }

      // 2. Start game with selected challenge mode
      const result = await newGame(mutableProfile, undefined, challengeMode)
      onGameCreated(result.game_id, result.state, mutableProfile)

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setIsStarting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#13151D] flex items-center justify-center p-6 relative font-sans text-slate-200">

      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-900/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Modal Container */}
      <div className="w-full max-w-6xl bg-[#1C1F2B]/95 border border-[#2A2D3A] rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden relative z-10">

        {/* Header */}
        <div className="px-8 py-6 flex items-start justify-between border-b border-[#2A2D3A]/50 bg-gradient-to-r from-[#1C1F2B] to-[#222532]">
          <div>
            <p className="text-amber-500 text-xs font-bold tracking-widest uppercase mb-1 drop-shadow-sm">Select Your City</p>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">CITY SELECTION</h1>
            <p className="text-slate-400 text-sm mt-1">Choose the city you wish to govern and define the game constraints.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHowToPlay(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#3A3D4A] text-slate-400 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-sm font-medium"
            >
              <BookOpen className="w-4 h-4" />
              How to Play
            </button>
            <button className="text-slate-500 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* City Carousel */}
        <div className="relative group">
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div
            ref={scrollRef}
            className="p-8 pb-4 flex gap-4 overflow-x-auto snap-x custom-scrollbar"
          >
            {PRESET_CITIES.map(city => {
              const isSelected = selectedCityId === city.id
              return (
                <button
                  key={city.id}
                  onClick={() => setSelectedCityId(city.id)}
                  className={`group relative snap-center shrink-0 w-[260px] h-[340px] rounded-2xl overflow-hidden transition-all duration-300 text-left border-2
                  ${isSelected ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-transparent hover:border-[#3A3D4A] hover:-translate-y-1'}
                `}
                >
                  {/* Background Image / Overlay */}
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url(${city.image})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-[#13151D]/90" />
                  <div className="absolute inset-0 bg-[#1C1F2B]/30 group-hover:bg-transparent transition-colors duration-300" />

                  {isSelected && (
                    <div className="absolute inset-0 border-[3px] border-amber-500/50 rounded-2xl pointer-events-none" />
                  )}

                  {/* Content */}
                  <div className="absolute inset-0 p-5 flex flex-col justify-between">
                    {/* Top: Name */}
                    <h3 className="text-2xl font-bold text-white drop-shadow-md">{city.name}</h3>

                    {/* Bottom: Stats & Issues */}
                    <div className="space-y-3">
                      {/* Budget row with challenge mode modifier */}
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <div className="flex items-center gap-1.5 text-white/90 drop-shadow-sm">
                          <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                          <span title="Annual Budget">{city.budgetStr}</span>
                        </div>
                        {challengeMode === 'reformist' && (
                          <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded drop-shadow-sm">−30%</span>
                        )}
                        {challengeMode === 'fiscal_hawk' && (
                          <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded drop-shadow-sm">−20%</span>
                        )}
                        {challengeMode === 'populist' && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded drop-shadow-sm">volatile</span>
                        )}
                      </div>

                      {/* Issues */}
                      <div className="space-y-1.5">
                        {city.issues.map((issue, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                            <div className={`w-2 h-2 rounded-full ${issue.color} shadow-[0_0_5px_${issue.color}]`} />
                            <span className="drop-shadow-sm">{issue.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_15px_rgba(0,0,0,0.5)]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Global Error */}
        {error && (
          <div className="px-8 mt-2">
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="mt-auto border-t border-[#2A2D3A]/50 bg-[#161822]/80">

          {/* Challenge Mode Row */}
          <div className="px-8 pt-4 pb-2">
            <span className="text-slate-500 text-xs font-bold tracking-widest uppercase mr-4">Challenge Mode:</span>
            <div className="inline-flex gap-2 flex-wrap">
              {CHALLENGE_MODES.map(m => {
                const isActive = challengeMode === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => setChallengeMode(m.id)}
                    title={m.desc}
                    className="px-3 py-1 rounded-lg text-xs font-bold tracking-wider transition-all"
                    style={{
                      border: `1px solid ${isActive ? m.color : '#2A2D3A'}`,
                      background: isActive ? `${m.color}22` : 'transparent',
                      color: isActive ? m.color : '#64748b',
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
              <span className="text-slate-600 text-xs self-center ml-2">
                — {CHALLENGE_MODES.find(m => m.id === challengeMode)?.desc}
              </span>
            </div>
          </div>

          <div className="p-4 px-8 flex items-center justify-between gap-8">
            {/* Sliders */}
            <div className="flex-1 flex items-center gap-12 bg-[#1C1F2B] border border-[#2A2D3A] rounded-xl px-6 py-4">
              {/* Turns Slider */}
              <div className="flex items-center gap-4 flex-1">
                <span className="text-slate-400 text-sm whitespace-nowrap">Turns to Election:</span>
                <div className="relative flex-1 flex items-center group">
                  <input
                    type="range"
                    min="5" max="10" step="1"
                    value={turnsToElection}
                    onChange={(e) => setTurnsToElection(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-amber-400 transition-all"
                  />
                </div>
                <div className="bg-[#2A2D3A] border border-[#3A3D4A] px-3 py-1 rounded text-sm text-white font-mono min-w-[3rem] text-center">
                  {turnsToElection}
                </div>
              </div>

              {/* Population Slider */}
              <div className="flex items-center gap-4 flex-1">
                <span className="text-slate-400 text-sm whitespace-nowrap">Population (M):</span>
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    min="1" max="50" step="1"
                    value={populationStr}
                    onChange={(e) => setPopulationStr(e.target.value)}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-amber-400 transition-all"
                  />
                </div>
                <div className="bg-[#2A2D3A] border border-[#3A3D4A] px-3 py-1 rounded text-sm text-white font-mono min-w-[3rem] text-center">
                  {populationStr}
                </div>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartGame}
              disabled={!selectedCityId || isStarting}
              className={`
                shrink-0 flex items-center gap-3 px-10 py-4 rounded-xl font-bold text-lg transition-all
                ${(!selectedCityId || isStarting)
                  ? 'bg-[#2A2D3A] text-slate-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_20px_rgba(217,119,6,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:-translate-y-0.5'}
              `}
            >
              {isStarting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> GENERATING...</>
              ) : (
                <><Play className="w-5 h-5 fill-current" /> START GAME</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── How to Play Overlay ── */}
      {showHowToPlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(10, 12, 20, 0.92)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowHowToPlay(false) }}
        >
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#1C1F2B] border border-[#2A2D3A] rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div
              className="px-8 py-6 flex items-center justify-between border-b border-[#2A2D3A]/60 shrink-0"
              style={{ background: 'linear-gradient(135deg, #1C1F2B 0%, #1a1d2e 100%)' }}
            >
              <div>
                <p className="text-amber-500 text-sm font-bold tracking-widest uppercase mb-1">Field Manual</p>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">HOW TO PLAY</h2>
                <p className="text-slate-400 text-base mt-0.5">Master the art of city governance</p>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="text-slate-500 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar">

              {/* The Premise */}
              <p className="text-slate-300 leading-relaxed text-base">
                You are the <span className="text-amber-400 font-semibold">Mayor</span> of a living, breathing city powered by AI.
                Every decision you make ripples through the economy, public services, and the lives of real citizens.
                Lead well — and earn re-election. Lead poorly — and face the consequences.
              </p>

              {/* Steps */}
              <div className="space-y-3">
                {(
                  [
                    {
                      num: '01',
                      icon: <MapPin className="w-5 h-5" />,
                      color: 'text-blue-400',
                      border: 'border-blue-500/25',
                      bg: 'bg-blue-500/5',
                      title: 'SELECT YOUR CITY & CHALLENGE MODE',
                      body: 'Pick from real-world cities — each with its own population, budget, and starting crises. Then choose a challenge mode: Standard for a balanced game, Reformist for a leaner budget with more scrutiny, Populist for volatile high-approval starts, or Fiscal Hawk for strict treasury discipline.',
                    },
                    {
                      num: '02',
                      icon: <Newspaper className="w-5 h-5" />,
                      color: 'text-amber-400',
                      border: 'border-amber-500/25',
                      bg: 'bg-amber-500/5',
                      title: 'MORNING BRIEFING',
                      body: "Each turn opens with a live cinematic briefing. Your ministers stream their reports on key metrics, active crises, media headlines, and citizen sentiment. At the end, the Intelligence Brief highlights hotspots to watch and opportunities on the horizon.",
                    },
                    {
                      num: '03',
                      icon: <FileText className="w-5 h-5" />,
                      color: 'text-violet-400',
                      border: 'border-violet-500/25',
                      bg: 'bg-violet-500/5',
                      title: 'CHOOSE A POLICY',
                      body: 'Your AI council drafts five policy options across different archetypes — Invest, Reform, Crackdown, Populist, and Compromise. Each card shows primary effects, side effects in orange, and trade-off notes. Some effects land immediately; others are deferred and shown as "+N deferred" chips on the metrics panel.',
                    },
                    {
                      num: '04',
                      icon: <Users className="w-5 h-5" />,
                      color: 'text-emerald-400',
                      border: 'border-emerald-500/25',
                      bg: 'bg-emerald-500/5',
                      title: 'ADVISOR DEBATE & MINISTER ASSIGNMENT',
                      body: "Your ministers vote on each policy — watch for the consensus badge: HIGH CONSENSUS means broad support, SPLIT CABINET means divided opinion, CABINET RESISTANCE means most oppose it. You also pick which minister executes the policy. Overworked ministers accumulate fatigue (shown as a bar) that reduces execution quality — rotate them wisely.",
                    },
                    {
                      num: '05',
                      icon: <BarChart3 className="w-5 h-5" />,
                      color: 'text-cyan-400',
                      border: 'border-cyan-500/25',
                      bg: 'bg-cyan-500/5',
                      title: 'WATCH THE CITY REACT',
                      body: 'After each policy, city metrics shift and citizens respond in their own words. The turn log shows an Outcome Drivers breakdown — which minister quality, side effects, and active events most influenced the result. Check the ALL PARAMETERS panel for deferred delta chips showing effects queued for future turns.',
                    },
                    {
                      num: '06',
                      icon: <Award className="w-5 h-5" />,
                      color: 'text-rose-400',
                      border: 'border-rose-500/25',
                      bg: 'bg-rose-500/5',
                      title: 'ELECTION RAMP & FINAL VOTE',
                      body: 'Two turns before the election, an Election Countdown banner appears showing your approval and composite welfare scores. Crisis events escalate and the Election Season Scrutiny event kicks in. When the final turn arrives, citizens vote based on your full governance record — your scorecard determines whether you win or get voted out.',
                    },
                  ] as { num: string; icon: ReactNode; color: string; border: string; bg: string; title: string; body: string }[]
                ).map((step) => (
                  <div key={step.num} className={`flex gap-4 p-4 rounded-xl border ${step.border} ${step.bg}`}>
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border ${step.border} ${step.color}`}>
                      {step.icon}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold tracking-widest text-slate-600">{step.num}</span>
                        <h3 className={`text-sm font-bold tracking-wider ${step.color}`}>{step.title}</h3>
                      </div>
                      <p className="text-slate-300 text-base leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pro tips */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <p className="text-amber-400 text-sm font-bold tracking-widest uppercase mb-2">💡 Minister Fatigue</p>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Every turn a minister executes a policy, their fatigue rises. High fatigue (shown in amber/red on the minister card) directly reduces execution quality — the city gets less of what you intended. Spread the workload and let fatigued ministers recover.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-violet-500/8 border border-violet-500/20">
                  <p className="text-violet-400 text-sm font-bold tracking-widest uppercase mb-2">📡 Intelligence Brief</p>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    After each turn completes, the Intelligence Brief card appears in the left panel. It flags metrics trending toward crisis thresholds, upcoming opportunities, and election pressure notes. Use it to plan your next policy before the next briefing begins.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-cyan-500/8 border border-cyan-500/20">
                  <p className="text-cyan-400 text-sm font-bold tracking-widest uppercase mb-2">⏱ Deferred Effects</p>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Some policies have time-profiled effects — a portion lands this turn, the rest arrives in future turns. Look for <span className="text-cyan-300 font-mono text-xs">+N deferred</span> chips beneath the progress bars in the ALL PARAMETERS panel to track what's coming.
                  </p>
                </div>
              </div>

              {/* Welfare composites */}
              <div>
                <p className="text-slate-400 text-sm font-bold tracking-widest uppercase mb-3">Welfare Indicators Explained</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'HEALTH',  desc: 'Avg of Hospitals & Air Quality',      color: 'text-rose-400',    dot: 'bg-rose-400' },
                    { label: 'WEALTH',  desc: 'Avg of Economy & Affordable Housing',  color: 'text-yellow-400',  dot: 'bg-yellow-400' },
                    { label: 'SAFETY',  desc: 'Avg of Police & Courts',               color: 'text-red-400',     dot: 'bg-red-400' },
                    { label: 'SOCIETY', desc: 'Avg of Community & Education',         color: 'text-violet-400',  dot: 'bg-violet-400' },
                    { label: 'INFRA',   desc: 'Avg of Transit & Water/Power',         color: 'text-cyan-400',    dot: 'bg-cyan-400' },
                    { label: 'GOVN',    desc: 'Avg of Admin Efficiency & Media',      color: 'text-emerald-400', dot: 'bg-emerald-400' },
                  ].map(m => (
                    <div key={m.label} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#161822] border border-[#2A2D3A]">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${m.dot}`} />
                      <div>
                        <p className={`text-xs font-bold tracking-widest ${m.color}`}>{m.label}</p>
                        <p className="text-slate-400 text-sm">{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Challenge modes cheat sheet */}
              <div>
                <p className="text-slate-400 text-sm font-bold tracking-widest uppercase mb-3">Challenge Modes</p>
                <div className="space-y-2">
                  {[
                    { label: 'STANDARD',    color: 'text-slate-400',  desc: 'Balanced starting conditions. Recommended for first-time mayors.' },
                    { label: 'REFORMIST',   color: 'text-blue-400',   desc: 'Treasury reduced by 30%, higher media freedom. Reform archetype policies score a bonus multiplier.' },
                    { label: 'POPULIST',    color: 'text-amber-400',  desc: 'Start with boosted citizen alignment but lower admin efficiency. Approval is volatile — it moves fast in both directions.' },
                    { label: 'FISCAL HAWK', color: 'text-rose-400',   desc: 'Treasury capped at 80% of standard. Running a deficit triggers immediate minister loyalty penalties.' },
                  ].map(m => (
                    <div key={m.label} className="flex items-start gap-3 p-3 rounded-lg bg-[#161822] border border-[#2A2D3A]">
                      <p className={`text-xs font-bold tracking-widest shrink-0 w-24 pt-0.5 ${m.color}`}>{m.label}</p>
                      <p className="text-slate-400 text-sm leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-[#2A2D3A]/60 bg-[#161822]/80 flex justify-end shrink-0">
              <button
                onClick={() => setShowHowToPlay(false)}
                className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(217,119,6,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] hover:-translate-y-0.5 text-base tracking-wide"
              >
                LET'S GOVERN →
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
