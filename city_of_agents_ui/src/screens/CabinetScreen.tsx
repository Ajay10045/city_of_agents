import { useState, useEffect, useRef } from 'react'
import { Loader2, AlertTriangle, Check, ChevronRight, ChevronLeft, X, Briefcase, GripVertical, Shuffle, Search, Settings } from 'lucide-react'
import { getMinisterCandidates, assignCabinet } from '../api'
import type { Citizen, GameState } from '../types'

// ── Portfolios ─────────────────────────────────────────────────────────────────

const PORTFOLIOS = [
  { id: 'Health', color: '#22c55e', bg: 'rgba(34,197,94,0.18)', border: '#14532d', icon: '🏥' },
  { id: 'Education', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)', border: '#4c1d95', icon: '🎓' },
  { id: 'Infrastructure', color: '#38bdf8', bg: 'rgba(56,189,248,0.18)', border: '#0c4a6e', icon: '🏗' },
  { id: 'Transport & Roads', color: '#60a5fa', bg: 'rgba(96,165,250,0.18)', border: '#1e3a8a', icon: '🛣' },
  { id: 'Security & Law', color: '#f87171', bg: 'rgba(248,113,113,0.18)', border: '#7f1d1d', icon: '⚖' },
  { id: 'Environment', color: '#4ade80', bg: 'rgba(74,222,128,0.18)', border: '#14532d', icon: '🌿' },
  { id: 'Housing', color: '#fb923c', bg: 'rgba(251,146,60,0.18)', border: '#7c2d12', icon: '🏘' },
  { id: 'Water & Power', color: '#22d3ee', bg: 'rgba(34,211,238,0.18)', border: '#164e63', icon: '⚡' },
  { id: 'Commerce', color: '#fbbf24', bg: 'rgba(251,191,36,0.18)', border: '#78350f', icon: '💼' },
  { id: 'Labor & Employment', color: '#94a3b8', bg: 'rgba(148,163,184,0.18)', border: '#334155', icon: '👷' },
]

interface PortfolioInfo { id: string; color: string; bg: string; border: string; icon: string }

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  gameId: string
  state: GameState
  onCabinetFormed: (state: GameState) => void
}

interface MinisterSelection {
  citizen: Citizen
  portfolios: string[]   // primary + extras
}

// ── Utility Functions ────────────────────────────────────────────────────────

function deriveAptitudeAxes(cap: Record<string, number>, per: Record<string, number>) {
  return {
    intellect: Math.round((cap.strategic_thinking ?? 50) * 0.6 + (cap.competence ?? 50) * 0.4),
    charisma: Math.round((per.empathy ?? 50) * 0.5 + (per.ambition ?? 50) * 0.3 + (cap.managerial_skill ?? 50) * 0.2),
    agility: Math.round((cap.crisis_handling ?? 50) * 0.6 + (per.risk_appetite ?? 50) * 0.4),
    experience: Math.round((cap.bureaucratic_navigation ?? 50) * 0.5 + (cap.competence ?? 50) * 0.3 + (cap.managerial_skill ?? 50) * 0.2),
  }
}

function deriveMeta(cap: Record<string, number>, per: Record<string, number>) {
  const vals = Object.values(cap)
  const avgCap = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 50
  return {
    strategicAlignment: Math.round(avgCap * 0.7 + (per.integrity ?? 50) * 0.3),
    politicalRisk: avgCap >= 65 ? 'Low' : avgCap >= 45 ? 'Medium' : 'High',
    costOfService: (2 + (avgCap / 100) * 5).toFixed(1) + 'M',
  }
}

function generateTargetId(citizen: Citizen): string {
  const initials = citizen.name.split(' ').map(w => w[0]).join('').toUpperCase()
  const hash = citizen.id.replace(/[^0-9]/g, '').slice(0, 5).padStart(5, '0')
  return `${initials}-${hash}`
}

// ── Agent Portraits (local) ──────────────────────────────────────────────────

// ── Agent Portraits (Demographic Match) ────────────────────────────────────────

function getPortraitForCandidate(name: string, candidates: Citizen[]): string {
  const c = candidates.find(can => can.name === name)
  if (!c) return '/agents/generic/generic_male_mid_1.png'

  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  h = Math.abs(h)

  const isFemale = h % 2 === 0
  const genderStr = isFemale ? 'female' : 'male'

  const ageGroup = c.demographics?.age_group || '36-50'
  let ageStr = 'mid'
  if (ageGroup.includes('18') || ageGroup.includes('25') || ageGroup.includes('26') || ageGroup.includes('35')) {
    ageStr = 'young'
  } else if (ageGroup.includes('51') || ageGroup.includes('65') || ageGroup.includes('+')) {
    ageStr = 'old'
  }

  let variant = 1
  if (ageStr === 'young' || ageStr === 'mid') {
    variant = ((h >> 1) % 2) + 1
  }

  return `/agents/generic/generic_${genderStr}_${ageStr}_${variant}.png`
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function CandidateAvatar({ name, candidates, size = 64, borderColor = '#1c3652', borderRadius = '50%' }: {
  name: string; candidates: Citizen[]; size?: number; borderColor?: string; borderRadius?: string
}) {
  return (
    <img
      src={getPortraitForCandidate(name, candidates)}
      alt={name}
      style={{
        width: size, height: size, borderRadius, border: `2px solid ${borderColor}`,
        background: '#0b1929', objectFit: 'cover', flexShrink: 0, display: 'block'
      }}
    />
  )
}

// ── RadarChart ──────────────────────────────────────────────────────────────────

function RadarChart({ axes, size = 200 }: {
  axes: { intellect: number; charisma: number; agility: number; experience: number }
  size?: number
}) {
  const pad = 36
  const vw = size + pad * 2, vh = size + pad * 2
  const cx = vw / 2, cy = vh / 2, r = size * 0.35
  const labels = [
    { key: 'intellect', label: 'INTELLECT', angle: 270 },
    { key: 'charisma', label: 'CHARISMA', angle: 0 },
    { key: 'experience', label: 'EXPERIENCE', angle: 90 },
    { key: 'agility', label: 'AGILITY', angle: 180 },
  ] as const

  const toXY = (angle: number, pct: number) => ({
    x: cx + r * (pct / 100) * Math.cos((angle * Math.PI) / 180),
    y: cy + r * (pct / 100) * Math.sin((angle * Math.PI) / 180),
  })

  const rings = [25, 50, 75, 100]
  const dataPoints = labels.map(l => toXY(l.angle, axes[l.key]))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${vw} ${vh}`} overflow="visible">
      {/* Grid rings */}
      {rings.map(ring => {
        const pts = labels.map(l => toXY(l.angle, ring))
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'
        return <path key={ring} d={path} fill="none" stroke="#1c3652" strokeWidth={0.5} opacity={0.6} />
      })}
      {/* Axis lines */}
      {labels.map(l => {
        const end = toXY(l.angle, 100)
        return <line key={l.key} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#1c3652" strokeWidth={0.5} opacity={0.4} />
      })}
      {/* Data polygon */}
      <path d={dataPath} fill="rgba(232,160,48,0.2)" stroke="#e8a030" strokeWidth={1.5}
        filter="url(#glow)" />
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#e8a030" />
      ))}
      {/* Labels with values */}
      {labels.map(l => {
        const pos = toXY(l.angle, 125)
        const textAnchor = l.angle === 0 ? 'start' : l.angle === 180 ? 'end' : 'middle'
        const dy = l.angle === 270 ? -6 : l.angle === 90 ? 14 : 4
        const val = axes[l.key]
        return (
          <g key={l.key}>
            <text x={pos.x} y={pos.y + dy} textAnchor={textAnchor}
              fill="#94a3b8" fontSize={10} fontFamily="'Rajdhani', sans-serif" fontWeight={700}
              letterSpacing="0.08em">{l.label}</text>
            <text x={pos.x} y={pos.y + dy + 13} textAnchor={textAnchor}
              fill="#e8a030" fontSize={12} fontFamily="'Share Tech Mono', monospace" fontWeight={700}>
              {val}
            </text>
          </g>
        )
      })}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}

// ── StatBar ────────────────────────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#e8a030' : '#f87171'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{
          fontSize: 9, color: '#64748b', fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: '0.06em', fontWeight: 600
        }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color, fontWeight: 700 }}>
          {Math.round(pct)}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 2, boxShadow: `0 0 6px ${color}66`, transition: 'width 0.4s ease'
        }} />
      </div>
    </div>
  )
}

// ── CityParamRow ──────────────────────────────────────────────────────────────

function CityParamRow({ label, value, accent }: { label: string; value: number; accent: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const col = pct >= 65 ? '#22c55e' : pct >= 40 ? accent : '#f87171'
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{
          fontSize: 9, color: '#94a3b8', fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: '0.04em'
        }}>{label}</span>
        <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: col, fontWeight: 700 }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${col}88, ${col})`,
          borderRadius: 2, transition: 'width 0.4s ease'
        }} />
      </div>
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CabinetScreen({ gameId, state, onCabinetFormed }: Props) {
  const [candidates, setCandidates] = useState<Citizen[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [interviewee, setInterviewee] = useState<Citizen | null>(null)
  const [cabinet, setCabinet] = useState<MinisterSelection[]>([])
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<string>>(new Set())

  // Drag & drop state
  const [draggingPortfolio, setDraggingPortfolio] = useState<string | null>(null)
  const [dragOverMinisterId, setDragOverMinisterId] = useState<string | null>(null)
  const dragPortfolioRef = useRef<string | null>(null)

  // Carousel scroll ref
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMinisterCandidates(gameId)
      .then(res => {
        setCandidates(res.candidates)
        if (res.candidates.length > 0) setInterviewee(res.candidates[0])
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [gameId])

  const cabinetIds = new Set(cabinet.map(m => m.citizen.id))
  const waitingCandidates = candidates
    .filter(c => !cabinetIds.has(c.id))
    .filter(c => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.demographics.profession.toLowerCase().includes(q)
    })
    .slice(0, 12)

  const assignedPortfolios = new Set(cabinet.flatMap(m => m.portfolios))
  const unassignedPortfolios = PORTFOLIOS.filter(p => !assignedPortfolios.has(p.id))
  const allAssigned = unassignedPortfolios.length === 0 && cabinet.length > 0

  function handleCallToDesk(c: Citizen) {
    setInterviewee(c)
    setSelectedPortfolios(new Set())
  }

  function togglePortfolio(pid: string) {
    setSelectedPortfolios(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function handleAppoint() {
    if (!interviewee || selectedPortfolios.size === 0) return
    const portfolioList = Array.from(selectedPortfolios)
    setCabinet(prev => [...prev, { citizen: interviewee, portfolios: portfolioList }])
    setInterviewee(null)
    setSelectedPortfolios(new Set())
  }

  function handleDismissFromCabinet(citizenId: string) {
    setCabinet(prev => prev.filter(m => m.citizen.id !== citizenId))
    if (interviewee?.id === citizenId) {
      setInterviewee(null)
      setSelectedPortfolios(new Set())
    }
  }

  function handleDragStart(portfolioId: string) {
    dragPortfolioRef.current = portfolioId
    setDraggingPortfolio(portfolioId)
  }

  function handleDragEnd() {
    setDraggingPortfolio(null)
    setDragOverMinisterId(null)
    dragPortfolioRef.current = null
  }

  function handleDropOnMinister(ministerId: string) {
    const pid = dragPortfolioRef.current
    if (!pid) return
    setCabinet(prev => prev.map(m =>
      m.citizen.id === ministerId && !m.portfolios.includes(pid)
        ? { ...m, portfolios: [...m.portfolios, pid] }
        : m
    ))
    setDraggingPortfolio(null)
    setDragOverMinisterId(null)
    dragPortfolioRef.current = null
  }

  function removePortfolioFromMinister(ministerId: string, portfolioId: string) {
    setCabinet(prev => prev.map(m => {
      if (m.citizen.id !== ministerId) return m
      const next = m.portfolios.filter(p => p !== portfolioId)
      return next.length > 0 ? { ...m, portfolios: next } : m
    }).filter(m => m.portfolios.length > 0))
  }

  function handleRandomCabinet() {
    const available = candidates.slice()
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
        ;[available[i], available[j]] = [available[j], available[i]]
    }
    const pIds = PORTFOLIOS.map(p => p.id)
    for (let i = pIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
        ;[pIds[i], pIds[j]] = [pIds[j], pIds[i]]
    }
    const count = Math.min(5, available.length)
    const newCabinet: MinisterSelection[] = []
    for (let i = 0; i < count; i++) {
      newCabinet.push({ citizen: available[i], portfolios: [] })
    }
    pIds.forEach((pid, idx) => {
      newCabinet[idx % count].portfolios.push(pid)
    })
    setCabinet(newCabinet)
    setInterviewee(null)
    setSelectedPortfolios(new Set())
  }

  async function handleBeginGovernance() {
    if (!allAssigned || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = cabinet.flatMap(m =>
        m.portfolios.map(p => ({ citizen_id: m.citizen.id, portfolio: p }))
      )
      await assignCabinet(gameId, payload)
      const updatedState = {
        ...state,
        ministers: cabinet.map(m => ({
          ...m.citizen,
          portfolio: m.portfolios[0],
          extra_portfolios: m.portfolios.slice(1),
          loyalty: 65,
          scandal_exposure: 0,
          political_capital: 50,
        })),
      } as GameState
      onCabinetFormed(updatedState)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  function scrollCarousel(dir: 'left' | 'right') {
    if (!carouselRef.current) return
    const amount = dir === 'left' ? -300 : 300
    carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050d1b', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16
      }}>
        <Loader2 style={{ width: 36, height: 36, color: '#e8a030' }} className="animate-spin" />
        <div style={{
          fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: '#7ba8d1',
          letterSpacing: '0.2em'
        }}>SUMMONING CANDIDATES...</div>
      </div>
    )
  }

  const p = interviewee?.personality as Record<string, number> | undefined
  const cap = interviewee?.capability as Record<string, number> | undefined
  const aptitude = cap && p ? deriveAptitudeAxes(cap, p) : null
  const meta = cap && p ? deriveMeta(cap, p) : null

  return (
    <div style={{
      height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#fff',
      background: 'radial-gradient(ellipse at 50% 0%, #0d1f36 0%, #071018 50%, #050d1b 100%)',
      position: 'relative',
    }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 10, height: 52, display: 'flex', alignItems: 'center',
        gap: 16, padding: '0 24px',
        background: 'linear-gradient(90deg, #071320 0%, #0a1828 40%, #071320 100%)',
        borderBottom: '1px solid #1c3652', boxShadow: '0 2px 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #92400e 100%)',
            boxShadow: '0 0 12px rgba(217,119,6,0.5)', border: '1.5px solid #f59e0b'
          }}>
            🏛
          </div>
          <div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14,
              color: '#f0c040', letterSpacing: '0.06em', textTransform: 'uppercase'
            }}>City of {state.city_name}</div>
            <div style={{
              fontSize: 10, color: '#7ba8d1', fontFamily: "'Share Tech Mono', monospace",
              letterSpacing: '0.1em'
            }}>CABINET FORMATION · MAYORAL OFFICE</div>
          </div>
        </div>

        {/* Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 32 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 14,
            background: cabinet.length > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${cabinet.length > 0 ? '#14532d' : '#1c3652'}`
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: cabinet.length > 0 ? '#22c55e' : '#334155',
              boxShadow: cabinet.length > 0 ? '0 0 6px #22c55e' : 'none'
            }} />
            <span style={{
              fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
              color: cabinet.length > 0 ? '#22c55e' : '#4b6280'
            }}>
              {cabinet.length} APPOINTED
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 14,
            background: allAssigned ? 'rgba(34,197,94,0.1)' : 'rgba(232,160,48,0.08)',
            border: `1px solid ${allAssigned ? '#14532d' : 'rgba(232,160,48,0.3)'}`
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: allAssigned ? '#22c55e' : '#e8a030',
              boxShadow: allAssigned ? '0 0 6px #22c55e' : '0 0 6px #e8a030'
            }} />
            <span style={{
              fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
              color: allAssigned ? '#22c55e' : '#e8a030'
            }}>
              {unassignedPortfolios.length} PORTFOLIOS LEFT
            </span>
          </div>
        </div>

        {/* Search + Random + Settings */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid #1c3652'
          }}>
            <Search size={12} color="#4b6280" />
            <input
              type="text"
              placeholder="Search profiles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: 'none', border: 'none', outline: 'none', color: '#cbd5e1',
                fontSize: 11, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em',
                width: 120
              }}
            />
          </div>
          <button
            onClick={handleRandomCabinet}
            disabled={candidates.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
              borderRadius: 6, border: '1px solid #1c3652', fontSize: 10, color: '#e8a030',
              fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', fontWeight: 700,
              background: 'rgba(232,160,48,0.06)', cursor: 'pointer', whiteSpace: 'nowrap',
              opacity: candidates.length === 0 ? 0.4 : 1
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,160,48,0.15)'; e.currentTarget.style.borderColor = '#e8a030' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(232,160,48,0.06)'; e.currentTarget.style.borderColor = '#1c3652' }}
          >
            <Shuffle size={11} /> RANDOM CABINET
          </button>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', border: '1px solid #1c3652',
            background: 'rgba(255,255,255,0.03)'
          }}>
            <Settings size={14} color="#4b6280" />
          </div>
        </div>
      </div>

      {/* ── CABINET STRIP ─────────────────────────────────────────────────────── */}
      {(cabinet.length > 0 || unassignedPortfolios.length > 0) && (
        <div style={{
          position: 'relative', zIndex: 5, flexShrink: 0, padding: '8px 16px',
          background: 'linear-gradient(90deg, rgba(7,19,32,0.98), rgba(10,24,40,0.98))',
          borderBottom: '1px solid rgba(232,160,48,0.15)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)'
        }}>

          {/* Minister chips row */}
          {cabinet.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto',
              paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid rgba(28,54,82,0.4)'
            }}>
              <span style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
                color: '#7ba8d1', letterSpacing: '0.2em', whiteSpace: 'nowrap', flexShrink: 0
              }}>CABINET ·</span>
              {cabinet.map(m => {
                const isOver = dragOverMinisterId === m.citizen.id
                return (
                  <div key={m.citizen.id}
                    onDragOver={e => { e.preventDefault(); setDragOverMinisterId(m.citizen.id) }}
                    onDragLeave={() => setDragOverMinisterId(null)}
                    onDrop={() => handleDropOnMinister(m.citizen.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px 4px 4px', borderRadius: 20, flexShrink: 0,
                      background: isOver ? 'rgba(232,160,48,0.15)' : 'rgba(255,255,255,0.04)',
                      border: isOver ? '1.5px dashed #e8a030' : '1px solid #1c3652',
                      transition: 'all 0.15s'
                    }}>
                    <CandidateAvatar name={m.citizen.name} candidates={candidates} size={26}
                      borderColor={PORTFOLIOS.find(p => p.id === m.portfolios[0])?.color ?? '#1c3652'} />
                    <div style={{ lineHeight: 1.1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                        {m.citizen.name.split(' ')[0]}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                        {m.portfolios.map(pid => {
                          const pInfo = PORTFOLIOS.find(p => p.id === pid)
                          return (
                            <span key={pid} style={{
                              fontSize: 10, padding: '0 5px', borderRadius: 8, whiteSpace: 'nowrap',
                              background: pInfo?.bg ?? 'rgba(255,255,255,0.06)',
                              border: `1px solid ${pInfo?.border ?? '#1c3652'}`,
                              color: pInfo?.color ?? '#e8a030',
                              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                              display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer'
                            }}
                              onClick={() => removePortfolioFromMinister(m.citizen.id, pid)}
                              title="Click to remove">
                              {pInfo?.icon} {pid} <span style={{ opacity: 0.5, fontSize: 9 }}>✕</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <button onClick={() => handleDismissFromCabinet(m.citizen.id)}
                      style={{
                        marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer',
                        color: '#7bb3d4', padding: 2, display: 'flex', flexShrink: 0
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                      <X size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Unassigned portfolio badges (draggable) */}
          {unassignedPortfolios.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
                color: '#6b9cc9', letterSpacing: '0.15em', whiteSpace: 'nowrap', flexShrink: 0
              }}>
                UNASSIGNED ·
              </span>
              {unassignedPortfolios.map(p => (
                <div key={p.id}
                  draggable
                  onDragStart={() => handleDragStart(p.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '3px 8px',
                    borderRadius: 10, whiteSpace: 'nowrap', cursor: draggingPortfolio === p.id ? 'grabbing' : 'grab',
                    background: p.bg, border: `1px solid ${p.border}`, color: p.color,
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                    opacity: draggingPortfolio === p.id ? 0.5 : 1,
                    transition: 'opacity 0.15s', userSelect: 'none'
                  }}>
                  <GripVertical size={9} style={{ opacity: 0.5 }} />
                  {p.icon} {p.id}
                </div>
              ))}
              {cabinet.length > 0 && (
                <span style={{
                  fontSize: 9, color: '#6b9cc9', fontStyle: 'italic',
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em'
                }}>
                  drag onto a minister to assign
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN 3-COLUMN ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* ── LEFT: Candidate Profile ────────────────────────────────────────── */}
        <div style={{
          width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid #1c3652',
          background: 'linear-gradient(180deg, #071320 0%, #050e1c 100%)'
        }}>

          <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid #1c3652', flexShrink: 0 }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
              letterSpacing: '0.2em', color: '#7ba8d1'
            }}>CANDIDATE PROFILE</div>
          </div>

          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
            {!interviewee ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 12, padding: 32, textAlign: 'center'
              }}>
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif", fontSize: 12, color: '#5a8fc0',
                  letterSpacing: '0.12em', lineHeight: 1.8
                }}>
                  SELECT A CANDIDATE<br />FROM BELOW TO REVIEW<br />THEIR PROFILE
                </div>
              </div>
            ) : (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Identity card */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <CandidateAvatar name={interviewee.name} candidates={candidates} size={56} borderColor="#e8a030" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15,
                      color: '#fff', lineHeight: 1.2
                    }}>{interviewee.name}</div>
                    <div style={{ fontSize: 10, color: '#60a5fa', marginTop: 1, fontStyle: 'italic' }}>
                      {interviewee.demographics.profession}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {interviewee.demographics.ideology_economic && (
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 3,
                          background: 'rgba(56,189,248,0.12)', border: '1px solid #0c4a6e',
                          color: '#7dd3fc', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.05em'
                        }}>
                          {interviewee.demographics.ideology_economic}
                        </span>
                      )}
                      {interviewee.demographics.ideology_social && (
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 3,
                          background: 'rgba(167,139,250,0.12)', border: '1px solid #4c1d95',
                          color: '#c4b5fd', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.05em'
                        }}>
                          {interviewee.demographics.ideology_social}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Aptitude Profile Card */}
                <div style={{
                  background: 'linear-gradient(180deg, rgba(232,160,48,0.05) 0%, rgba(7,16,28,0.6) 100%)',
                  border: '1px solid rgba(232,160,48,0.2)', borderRadius: 8, padding: '10px 10px 8px'
                }}>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.15em', color: '#e8a030', marginBottom: 2
                  }}>CANDIDATE POTENTIAL</div>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 700,
                    color: '#fff', letterSpacing: '0.04em', marginBottom: 4
                  }}>APTITUDE PROFILE</div>

                  {aptitude && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '0 -10px' }}>
                      <RadarChart axes={aptitude} size={190} />
                    </div>
                  )}

                  {/* Meta stats below chart */}
                  {meta && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6,
                      padding: '8px 4px 4px', borderTop: '1px solid rgba(28,54,82,0.4)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 9, color: '#64748b', fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 600
                        }}>Strategic Alignment</span>
                        <span style={{
                          fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                          color: '#22c55e', fontWeight: 700
                        }}>{meta.strategicAlignment}%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 9, color: '#64748b', fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 600
                        }}>Political Risk</span>
                        <span style={{
                          fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                          color: meta.politicalRisk === 'Low' ? '#22c55e' : meta.politicalRisk === 'Medium' ? '#e8a030' : '#f87171',
                          fontWeight: 700
                        }}>{meta.politicalRisk}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 9, color: '#64748b', fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 600
                        }}>Cost of Service</span>
                        <span style={{
                          fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                          color: '#cbd5e1', fontWeight: 700
                        }}>{meta.costOfService} <span style={{ fontSize: 10, color: '#7ba8d1' }}>CR</span></span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Capability section */}
                <div>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.15em', color: '#e8a030', marginBottom: 6
                  }}>CAPABILITY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <StatBar label="Competence" value={cap?.competence ?? 50} />
                    <StatBar label="Managerial Skill" value={cap?.managerial_skill ?? 50} />
                    <StatBar label="Strategic Thinking" value={cap?.strategic_thinking ?? 50} />
                    <StatBar label="Crisis Handling" value={cap?.crisis_handling ?? 50} />
                    <StatBar label="Bureaucratic Nav." value={cap?.bureaucratic_navigation ?? 50} />
                  </div>
                </div>

                {/* Portfolio selection */}
                <div>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.18em', color: '#7ba8d1', marginBottom: 7
                  }}>
                    ASSIGN PORTFOLIOS
                    {selectedPortfolios.size > 0 && (
                      <span style={{ marginLeft: 8, color: '#e8a030' }}>{selectedPortfolios.size} selected</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {PORTFOLIOS.map((pf: PortfolioInfo) => {
                      const isAssigned = assignedPortfolios.has(pf.id)
                      const isSelected = selectedPortfolios.has(pf.id)
                      return (
                        <button key={pf.id}
                          disabled={isAssigned}
                          onClick={() => togglePortfolio(pf.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 7px',
                            borderRadius: 5, cursor: isAssigned ? 'not-allowed' : 'pointer',
                            background: isSelected ? pf.bg : isAssigned ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
                            border: isSelected ? `1.5px solid ${pf.color}` : isAssigned ? '1px solid rgba(28,54,82,0.2)' : '1px solid #1a2f44',
                            opacity: isAssigned ? 0.3 : 1, transition: 'all 0.15s',
                            textAlign: 'left', outline: 'none',
                            boxShadow: isSelected ? `0 0 8px ${pf.color}33` : 'none'
                          }}
                          onMouseEnter={e => { if (!isAssigned && !isSelected) e.currentTarget.style.borderColor = pf.color + '66' }}
                          onMouseLeave={e => { if (!isAssigned && !isSelected) e.currentTarget.style.borderColor = '#1a2f44' }}>
                          <span style={{ fontSize: 11, lineHeight: 1 }}>{pf.icon}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, lineHeight: 1.2,
                            fontFamily: "'Rajdhani', sans-serif",
                            color: isAssigned ? '#334155' : isSelected ? pf.color : '#94a3b8'
                          }}>
                            {pf.id}
                          </span>
                          {isAssigned && <Check size={8} color="#334155" style={{ marginLeft: 'auto' }} />}
                          {isSelected && <div style={{
                            marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%',
                            background: pf.color, boxShadow: `0 0 4px ${pf.color}`
                          }} />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Appoint + Dismiss */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={handleAppoint}
                    disabled={selectedPortfolios.size === 0}
                    style={{
                      width: '100%', padding: '9px 0', borderRadius: 6,
                      background: selectedPortfolios.size > 0 ? 'linear-gradient(135deg, #c47d10, #e8a030)' : '#0a1828',
                      border: selectedPortfolios.size > 0 ? '1px solid rgba(255,200,60,0.4)' : '1px solid #1c3652',
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em',
                      color: selectedPortfolios.size > 0 ? '#040d1b' : '#334155',
                      cursor: selectedPortfolios.size > 0 ? 'pointer' : 'not-allowed',
                      boxShadow: selectedPortfolios.size > 0 ? '0 0 14px rgba(232,160,48,0.25)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      transition: 'all 0.2s'
                    }}>
                    <Briefcase size={12} />
                    {selectedPortfolios.size > 0
                      ? `APPOINT (${selectedPortfolios.size} PORTFOLIO${selectedPortfolios.size > 1 ? 'S' : ''})`
                      : 'SELECT PORTFOLIOS FIRST'}
                  </button>
                  <button onClick={() => { setInterviewee(null); setSelectedPortfolios(new Set()) }}
                    style={{
                      width: '100%', padding: '6px 0', borderRadius: 5, background: 'none',
                      border: '1px solid #1c3652', color: '#7ba8d1', cursor: 'pointer',
                      fontFamily: "'Rajdhani', sans-serif", fontSize: 10, letterSpacing: '0.1em',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#f87171'; e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1c3652'; e.currentTarget.style.color = '#4b6280' }}>
                    CLOSE
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ── CENTER: Hero Portrait ──────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          position: 'relative',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(13,31,54,0.8) 0%, rgba(5,13,27,1) 70%)'
        }}>

          {!interviewee ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 16
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(232,160,48,0.05)', border: '2px dashed rgba(232,160,48,0.2)'
              }}>
                <span style={{ fontSize: 32, opacity: 0.3 }}>?</span>
              </div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: 14, color: '#5a8fc0',
                letterSpacing: '0.2em', textAlign: 'center', lineHeight: 1.8
              }}>
                SELECT A CANDIDATE
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', position: 'relative', padding: 24
            }}>

              {/* Scan line overlay */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(232,160,48,0.015) 3px, rgba(232,160,48,0.015) 4px)',
                zIndex: 2
              }} />

              {/* Corner brackets */}
              <div style={{
                position: 'absolute', top: 20, left: 20, width: 40, height: 40,
                borderTop: '2px solid rgba(232,160,48,0.4)', borderLeft: '2px solid rgba(232,160,48,0.4)',
                pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', top: 20, right: 20, width: 40, height: 40,
                borderTop: '2px solid rgba(232,160,48,0.4)', borderRight: '2px solid rgba(232,160,48,0.4)',
                pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', bottom: 20, left: 20, width: 40, height: 40,
                borderBottom: '2px solid rgba(232,160,48,0.4)', borderLeft: '2px solid rgba(232,160,48,0.4)',
                pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', bottom: 20, right: 20, width: 40, height: 40,
                borderBottom: '2px solid rgba(232,160,48,0.4)', borderRight: '2px solid rgba(232,160,48,0.4)',
                pointerEvents: 'none'
              }} />

              {/* Target ID badge */}
              <div style={{
                position: 'absolute', top: 32, left: 32, zIndex: 5,
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 4, padding: '4px 10px'
              }}>
                <div style={{
                  fontSize: 10, color: '#38bdf8', fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700, letterSpacing: '0.1em'
                }}>TARGET ID</div>
                <div style={{
                  fontSize: 14, color: '#fff', fontFamily: "'Share Tech Mono', monospace",
                  fontWeight: 700, letterSpacing: '0.06em'
                }}>{generateTargetId(interviewee)}</div>
              </div>

              {/* Active Scan badge */}
              <div style={{
                position: 'absolute', bottom: 100, right: 32, zIndex: 5,
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 4, padding: '5px 10px'
              }}>
                <span style={{ fontSize: 9, color: '#7ba8d1', fontFamily: "'Share Tech Mono', monospace" }}>radar</span>
                <span style={{
                  fontSize: 9, color: '#22c55e', fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700, letterSpacing: '0.1em',
                  animation: 'pulse 2s infinite'
                }}>ACTIVE SCAN</span>
              </div>

              {/* Glow behind avatar */}
              <div style={{
                position: 'absolute', width: 350, height: 350, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(232,160,48,0.08) 0%, transparent 70%)',
                pointerEvents: 'none', zIndex: 0
              }} />

              {/* Large Avatar */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <img
                  src={getPortraitForCandidate(interviewee.name, candidates)}
                  alt={interviewee.name}
                  style={{
                    width: 280, height: 280, borderRadius: 12,
                    border: '2px solid rgba(232,160,48,0.3)',
                    background: '#0b1929', objectFit: 'cover',
                    boxShadow: '0 0 60px rgba(232,160,48,0.15), 0 20px 60px rgba(0,0,0,0.5)'
                  }}
                />
              </div>

              {/* Name overlay at bottom */}
              <div style={{ textAlign: 'center', marginTop: 20, zIndex: 3 }}>
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 36,
                  color: '#fff', letterSpacing: '0.06em', lineHeight: 1,
                  textShadow: '0 0 30px rgba(255,255,255,0.15)'
                }}>
                  {interviewee.name.toUpperCase()}
                </div>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                  color: '#e8a030', letterSpacing: '0.25em', marginTop: 6
                }}>
                  CANDIDATE SELECTED
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Impact Forecast ─────────────────────────────────────────── */}
        <div style={{
          width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid #1c3652', overflow: 'hidden',
          background: 'linear-gradient(180deg, #071320 0%, #050e1c 100%)'
        }}>

          <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid #1c3652', flexShrink: 0 }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
              letterSpacing: '0.15em', color: '#e8a030', marginBottom: 1
            }}>IMPACT FORECAST</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 700,
              color: '#fff', letterSpacing: '0.04em'
            }}>CITY PARAMETERS</div>
          </div>

          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {/* Layer A */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                color: '#38bdf8', fontWeight: 700, marginBottom: 6
              }}>LAYER A · ECONOMIC & INFRA</div>
              {[
                { label: 'Jobs & Commerce', val: state.city_params.jobs_and_commerce },
                { label: 'Transit & Roads', val: state.city_params.transit_and_roads },
                { label: 'Water / Power / Sanitation', val: state.city_params.water_power_sanitation },
              ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#38bdf8" />)}
            </div>

            {/* Layer B */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                color: '#a78bfa', fontWeight: 700, marginBottom: 6
              }}>LAYER B · HUMAN & SOCIAL</div>
              {[
                { label: 'Hospitals & Clinics', val: state.city_params.hospitals_and_clinics },
                { label: 'Schools & Universities', val: state.city_params.schools_and_universities },
                { label: 'Affordable Housing', val: state.city_params.affordable_housing },
              ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#a78bfa" />)}
            </div>

            {/* Layer C */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                color: '#4ade80', fontWeight: 700, marginBottom: 6
              }}>LAYER C · SAFETY & ENV</div>
              {[
                { label: 'Police & Emergency', val: state.city_params.police_and_emergency },
                { label: 'Air Quality & Pollution', val: state.city_params.air_quality_and_pollution },
              ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#4ade80" />)}
            </div>

            {/* Layer D — highlighted */}
            <div style={{
              background: 'rgba(232,160,48,0.05)', border: '1px solid rgba(232,160,48,0.2)',
              borderRadius: 6, padding: '8px 10px'
            }}>
              <div style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                color: '#e8a030', fontWeight: 700, marginBottom: 6
              }}>LAYER D · GOVERNANCE (META)</div>
              {[
                { label: 'Admin Efficiency', val: state.city_params.admin_efficiency },
                { label: 'Anti-Corruption', val: state.city_params.anti_corruption },
              ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#e8a030" />)}
            </div>
          </div>

          {/* Confirm Appointment button */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid #1c3652', flexShrink: 0 }}>
            <button
              onClick={handleBeginGovernance}
              disabled={!allAssigned || submitting}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 8,
                background: allAssigned && !submitting
                  ? 'linear-gradient(135deg, #c47d10, #e8a030, #c47d10)'
                  : '#0a1828',
                border: allAssigned && !submitting
                  ? '1px solid rgba(255,200,60,0.5)'
                  : '1px solid #1c3652',
                cursor: allAssigned && !submitting ? 'pointer' : 'not-allowed',
                boxShadow: allAssigned && !submitting
                  ? '0 0 30px rgba(232,160,48,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                  : 'none',
                transition: 'all 0.3s',
              }}>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14,
                letterSpacing: '0.12em',
                color: allAssigned && !submitting ? '#040d1b' : '#334155',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}>
                {submitting ? (
                  <><Loader2 size={14} className="animate-spin" /> FORMING CABINET...</>
                ) : (
                  <>CONFIRM APPOINTMENT</>
                )}
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
                letterSpacing: '0.2em', marginTop: 3,
                color: allAssigned && !submitting ? 'rgba(4,13,27,0.6)' : '#1c3652'
              }}>
                LEGALLY BINDING PROTOCOL
              </div>
            </button>
          </div>
        </div>

      </div>

      {/* ── BOTTOM CAROUSEL ──────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid #1c3652', position: 'relative',
        background: 'linear-gradient(180deg, #071320 0%, #050d1b 100%)'
      }}>

        {/* Scroll buttons */}
        <button onClick={() => scrollCarousel('left')}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 32, zIndex: 5,
            background: 'linear-gradient(90deg, rgba(7,19,32,0.95), transparent)',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#7ba8d1'
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8a030')}
          onMouseLeave={e => (e.currentTarget.style.color = '#4b6280')}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => scrollCarousel('right')}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 32, zIndex: 5,
            background: 'linear-gradient(270deg, rgba(7,19,32,0.95), transparent)',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#7ba8d1'
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8a030')}
          onMouseLeave={e => (e.currentTarget.style.color = '#4b6280')}>
          <ChevronRight size={18} />
        </button>

        <div ref={carouselRef}
          style={{
            display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 40px',
            scrollSnapType: 'x mandatory', scrollBehavior: 'smooth'
          }}
          className="scrollbar-hide">
          {waitingCandidates.map(c => {
            const isSelected = interviewee?.id === c.id
            return (
              <div key={c.id}
                onClick={() => handleCallToDesk(c)}
                style={{
                  flexShrink: 0, width: 180, cursor: 'pointer', userSelect: 'none',
                  scrollSnapAlign: 'center',
                  background: isSelected
                    ? 'linear-gradient(180deg, rgba(232,160,48,0.12) 0%, rgba(10,24,40,0.95) 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(7,16,28,0.95) 100%)',
                  border: isSelected ? '1.5px solid rgba(232,160,48,0.6)' : '1px solid #1c3652',
                  borderRadius: 8, overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#2a4a6a'
                    e.currentTarget.style.transform = 'translateY(-3px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#1c3652'
                    e.currentTarget.style.transform = ''
                    e.currentTarget.style.boxShadow = ''
                  }
                }}>

                {/* Selected badge */}
                {isSelected && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    background: 'linear-gradient(180deg, rgba(232,160,48,0.2), transparent)',
                    padding: '4px 0', textAlign: 'center', zIndex: 2
                  }}>
                    <span style={{
                      fontSize: 10, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                      letterSpacing: '0.15em', color: '#22c55e'
                    }}>SELECTED</span>
                  </div>
                )}

                {/* Avatar section */}
                <div style={{
                  display: 'flex', justifyContent: 'center', padding: '14px 14px 8px',
                  position: 'relative'
                }}>
                  <CandidateAvatar name={c.name} candidates={candidates} size={80}
                    borderColor={isSelected ? '#e8a030' : '#1c3652'}
                    borderRadius="8px" />
                </div>

                {/* Name & role */}
                <div style={{ padding: '0 10px 10px', textAlign: 'left' }}>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11,
                    color: isSelected ? '#f0c040' : '#e2e8f0',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>
                    {c.name.toUpperCase()}
                  </div>
                  <div style={{
                    fontSize: 9, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1
                  }}>
                    {c.demographics.profession}
                  </div>
                </div>
              </div>
            )
          })}

          {waitingCandidates.length === 0 && (
            <div style={{
              width: '100%', textAlign: 'center', padding: '24px 0',
              color: '#5a8fc0', fontSize: 11, fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: '0.1em'
            }}>
              ALL CANDIDATES HAVE BEEN APPOINTED
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'absolute', bottom: 200, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: 'rgba(127,29,29,0.98)', border: '1px solid #f87171',
          borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>
          <AlertTriangle size={14} color="#f87171" />
          <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>
          <button onClick={() => setError(null)} style={{
            background: 'none', border: 'none',
            color: '#f87171', cursor: 'pointer', marginLeft: 8
          }}>✕</button>
        </div>
      )}

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
