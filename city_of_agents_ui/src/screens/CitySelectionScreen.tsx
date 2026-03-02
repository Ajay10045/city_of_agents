import { useState, useRef } from 'react'
import { Loader2, Play, Users, Banknote, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
    popStr: '33.8M',
    budgetStr: '$9.2B',
    issues: [{ label: 'Traffic Congestion', color: 'bg-amber-500' }, { label: 'Pollution', color: 'bg-red-500' }, { label: 'Income Gap', color: 'bg-blue-500' }],
    hint: 'New Delhi, India — a massive capital with extreme wealth disparity, deep administrative complexity, and severe pollution issues.'
  },
  {
    id: 'dubai',
    name: 'Dubai',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=800&auto=format&fit=crop',
    popStr: '3.6M',
    budgetStr: '$21.5B',
    issues: [{ label: 'Cost of Living', color: 'bg-amber-500' }, { label: 'Labor Rights', color: 'bg-red-500' }],
    hint: 'Dubai, UAE — an ultra-modern desert metropolis known for luxury commerce, rapid development, and a massive expatriate workforce.'
  },
  {
    id: 'london',
    name: 'London',
    image: 'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?q=80&w=800&auto=format&fit=crop',
    popStr: '9.0M',
    budgetStr: '$25.0B',
    issues: [{ label: 'Housing Costs', color: 'bg-red-500' }, { label: 'Transit Delays', color: 'bg-amber-500' }, { label: 'Economic Pressure', color: 'bg-blue-500' }],
    hint: 'London, UK — a historic global financial hub balancing immense cultural heritage with intense modern infrastructure and housing pressures.'
  },
  {
    id: 'new_york',
    name: 'New York',
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=800&auto=format&fit=crop',
    popStr: '8.3M',
    budgetStr: '$107.0B',
    issues: [{ label: 'Inequality', color: 'bg-red-500' }, { label: 'Aging Infrastructure', color: 'bg-amber-500' }],
    hint: 'New York City, USA — a dense, iconic metropolis driven by commerce and culture, facing extreme housing costs and aging transit.'
  },
  {
    id: 'san_francisco',
    name: 'San Francisco',
    image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=800&auto=format&fit=crop',
    popStr: '0.8M',
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

  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStartGame() {
    if (!selectedCityId) return
    const city = PRESET_CITIES.find(c => c.id === selectedCityId)
    if (!city) return

    setIsStarting(true)
    setError(null)

    try {
      // 1. Generate profile from hint
      const profile = await generateProfile(city.hint)

      // Override game config based on sliders
      if (profile.game_config) {
        (profile.game_config as Record<string, unknown>).total_turns = turnsToElection;
        (profile.game_config as Record<string, unknown>).election_turn = Math.max(3, turnsToElection - 1)
      }

      // 2. Start game
      const result = await newGame(profile)
      onGameCreated(result.game_id, result.state, profile)

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
          <button className="text-slate-500 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
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
                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-xs font-medium">
                        <div className="flex items-center gap-1.5 text-white/90 drop-shadow-sm">
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          <span title="Population">{city.popStr}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/90 drop-shadow-sm">
                          <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                          <span title="Annual Budget">{city.budgetStr}</span>
                        </div>
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
        <div className="mt-auto p-6 px-8 flex items-center justify-between border-t border-[#2A2D3A]/50 bg-[#161822]/80 gap-8">

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
  )
}
