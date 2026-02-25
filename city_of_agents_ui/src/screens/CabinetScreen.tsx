import { useState, useEffect, useRef } from 'react'
import { Loader2, AlertTriangle, Check, ChevronRight, X, Briefcase, GripVertical, Shuffle } from 'lucide-react'
import { getMinisterCandidates, assignCabinet } from '../api'
import type { Citizen, GameState } from '../types'

// ── Portfolios ─────────────────────────────────────────────────────────────────

const PORTFOLIOS = [
  { id: 'Health',             color: '#22c55e', bg: 'rgba(34,197,94,0.18)',   border: '#14532d',  icon: '🏥' },
  { id: 'Education',          color: '#a78bfa', bg: 'rgba(167,139,250,0.18)', border: '#4c1d95',  icon: '🎓' },
  { id: 'Infrastructure',     color: '#38bdf8', bg: 'rgba(56,189,248,0.18)',  border: '#0c4a6e',  icon: '🏗' },
  { id: 'Transport & Roads',  color: '#60a5fa', bg: 'rgba(96,165,250,0.18)',  border: '#1e3a8a',  icon: '🛣' },
  { id: 'Security & Law',     color: '#f87171', bg: 'rgba(248,113,113,0.18)', border: '#7f1d1d',  icon: '⚖' },
  { id: 'Environment',        color: '#4ade80', bg: 'rgba(74,222,128,0.18)',  border: '#14532d',  icon: '🌿' },
  { id: 'Housing',            color: '#fb923c', bg: 'rgba(251,146,60,0.18)',  border: '#7c2d12',  icon: '🏘' },
  { id: 'Water & Power',      color: '#22d3ee', bg: 'rgba(34,211,238,0.18)',  border: '#164e63',  icon: '⚡' },
  { id: 'Commerce',           color: '#fbbf24', bg: 'rgba(251,191,36,0.18)',  border: '#78350f',  icon: '💼' },
  { id: 'Labor & Employment', color: '#94a3b8', bg: 'rgba(148,163,184,0.18)', border: '#334155',  icon: '👷' },
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

// ── Avatar ─────────────────────────────────────────────────────────────────────

function CandidateAvatar({ name, size = 64, borderColor = '#1c3652' }: { name: string; size?: number; borderColor?: string }) {
  return (
    <img
      src={`https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(name)}&backgroundColor=1e3a5f,0f2942,1a2f4a,0d2137`}
      alt={name}
      style={{ width: size, height: size, borderRadius: '50%', border: `2px solid ${borderColor}`,
        background: '#0b1929', objectFit: 'cover', flexShrink: 0, display: 'block' }}
    />
  )
}

// ── StatBar ────────────────────────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#e8a030' : '#f87171'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: '#64748b', fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: '0.06em', fontWeight: 600 }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color, fontWeight: 700 }}>
          {Math.round(pct)}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 2, boxShadow: `0 0 6px ${color}66`, transition: 'width 0.4s ease' }} />
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
        <span style={{ fontSize: 9, color: '#64748b', fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: col, fontWeight: 700 }}>
          {Math.round(pct)}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${col}88, ${col})`,
          borderRadius: 2, transition: 'width 0.4s ease' }} />
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

  // Candidate currently at the desk
  const [interviewee, setInterviewee] = useState<Citizen | null>(null)
  // Confirmed cabinet — each minister holds 1+ portfolios
  const [cabinet, setCabinet] = useState<MinisterSelection[]>([])
  // Portfolios selected in the desk grid (multi-select)
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<string>>(new Set())

  // Drag & drop state
  const [draggingPortfolio, setDraggingPortfolio] = useState<string | null>(null)
  const [dragOverMinisterId, setDragOverMinisterId] = useState<string | null>(null)
  const dragPortfolioRef = useRef<string | null>(null)

  useEffect(() => {
    getMinisterCandidates(gameId)
      .then(res => { setCandidates(res.candidates); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [gameId])

  // Top 12 candidates, filter out those already in cabinet
  const cabinetIds = new Set(cabinet.map(m => m.citizen.id))
  const waitingCandidates = candidates
    .filter(c => !cabinetIds.has(c.id))
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

  // Drag portfolio badge onto minister chip
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
      // If removing last portfolio, remove the minister entirely
      return next.length > 0 ? { ...m, portfolios: next } : m
    }).filter(m => m.portfolios.length > 0))
  }

  function handleRandomCabinet() {
    const available = candidates.slice()
    // Shuffle candidates
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[available[i], available[j]] = [available[j], available[i]]
    }
    // Shuffle portfolios
    const pIds = PORTFOLIOS.map(p => p.id)
    for (let i = pIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pIds[i], pIds[j]] = [pIds[j], pIds[i]]
    }
    // Assign ~2 portfolios per minister across 5 ministers
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#050d1b', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Loader2 style={{ width: 36, height: 36, color: '#e8a030' }} className="animate-spin" />
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: '#4b6280',
          letterSpacing: '0.2em' }}>SUMMONING CANDIDATES...</div>
      </div>
    )
  }

  const p = interviewee?.personality as Record<string, number> | undefined
  const cap = interviewee?.capability as Record<string, number> | undefined

  return (
    <div style={{
      height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#fff',
      background: 'radial-gradient(ellipse at 50% 0%, #0d1f36 0%, #071018 50%, #050d1b 100%)',
      position: 'relative',
    }}>


      {/* ── TOP BAR ──────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 10, height: 52, display: 'flex', alignItems: 'center',
        gap: 16, padding: '0 24px',
        background: 'linear-gradient(90deg, #071320 0%, #0a1828 40%, #071320 100%)',
        borderBottom: '1px solid #1c3652', boxShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #92400e 100%)',
            boxShadow: '0 0 12px rgba(217,119,6,0.5)', border: '1.5px solid #f59e0b' }}>🏛</div>
          <div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14,
              color: '#f0c040', letterSpacing: '0.06em' }}>City of {state.city_name}</div>
            <div style={{ fontSize: 10, color: '#4b6280', fontFamily: "'Share Tech Mono', monospace",
              letterSpacing: '0.1em' }}>CABINET FORMATION · MAYORAL OFFICE</div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%',
              background: cabinet.length > 0 ? '#22c55e' : '#334155',
              boxShadow: cabinet.length > 0 ? '0 0 6px #22c55e' : 'none' }} />
            <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
              color: cabinet.length > 0 ? '#22c55e' : '#4b6280' }}>
              {cabinet.length} APPOINTED
            </span>
          </div>
          <div style={{ width: 1, height: 20, background: '#1c3652' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%',
              background: unassignedPortfolios.length === 0 && cabinet.length > 0 ? '#22c55e' : '#e8a030',
              boxShadow: unassignedPortfolios.length === 0 && cabinet.length > 0 ? '0 0 6px #22c55e' : '0 0 6px #e8a030' }} />
            <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
              color: unassignedPortfolios.length === 0 && cabinet.length > 0 ? '#22c55e' : '#e8a030' }}>
              {unassignedPortfolios.length} PORTFOLIOS LEFT
            </span>
          </div>
        </div>
      </div>

      {/* ── CABINET STRIP ─────────────────────────────────────────────────────── */}
      {(cabinet.length > 0 || unassignedPortfolios.length > 0) && (
        <div style={{ position: 'relative', zIndex: 5, flexShrink: 0, padding: '8px 16px',
          background: 'linear-gradient(90deg, rgba(7,19,32,0.98), rgba(10,24,40,0.98))',
          borderBottom: '1px solid rgba(232,160,48,0.15)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>

          {/* Minister chips row */}
          {cabinet.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto',
              paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid rgba(28,54,82,0.4)' }}>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
                color: '#4b6280', letterSpacing: '0.2em', whiteSpace: 'nowrap', flexShrink: 0 }}>CABINET ·</span>
              {cabinet.map(m => {
                const isOver = dragOverMinisterId === m.citizen.id
                return (
                  <div key={m.citizen.id}
                    onDragOver={e => { e.preventDefault(); setDragOverMinisterId(m.citizen.id) }}
                    onDragLeave={() => setDragOverMinisterId(null)}
                    onDrop={() => handleDropOnMinister(m.citizen.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px 4px 4px', borderRadius: 20, flexShrink: 0,
                      background: isOver ? 'rgba(232,160,48,0.15)' : 'rgba(255,255,255,0.04)',
                      border: isOver ? '1.5px dashed #e8a030' : '1px solid #1c3652',
                      transition: 'all 0.15s' }}>
                    <CandidateAvatar name={m.citizen.name} size={26}
                      borderColor={PORTFOLIOS.find(p => p.id === m.portfolios[0])?.color ?? '#1c3652'} />
                    <div style={{ lineHeight: 1.1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                        {m.citizen.name.split(' ')[0]}
                      </div>
                      {/* Portfolio pills */}
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                        {m.portfolios.map(pid => {
                          const pInfo = PORTFOLIOS.find(p => p.id === pid)
                          return (
                            <span key={pid} style={{ fontSize: 8, padding: '0 5px', borderRadius: 8, whiteSpace: 'nowrap',
                              background: pInfo?.bg ?? 'rgba(255,255,255,0.06)',
                              border: `1px solid ${pInfo?.border ?? '#1c3652'}`,
                              color: pInfo?.color ?? '#e8a030',
                              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                              display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                              onClick={() => removePortfolioFromMinister(m.citizen.id, pid)}
                              title="Click to remove">
                              {pInfo?.icon} {pid} <span style={{ opacity: 0.5, fontSize: 7 }}>✕</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <button onClick={() => handleDismissFromCabinet(m.citizen.id)}
                      style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer',
                        color: '#475569', padding: 2, display: 'flex', flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                      <X size={11} />
                    </button>
                  </div>
                )
              })}
              {allAssigned && (
                <button onClick={handleBeginGovernance} disabled={submitting}
                  style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 18px', borderRadius: 20,
                    background: submitting ? '#1a2a3a' : 'linear-gradient(135deg, #c47d10, #e8a030)',
                    border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12,
                    letterSpacing: '0.1em', color: submitting ? '#4b6280' : '#040d1b',
                    boxShadow: submitting ? 'none' : '0 0 20px rgba(232,160,48,0.5)',
                    whiteSpace: 'nowrap' }}>
                  {submitting ? <><Loader2 size={13} className="animate-spin" /> FORMING...</> : <>BEGIN GOVERNANCE <ChevronRight size={13} /></>}
                </button>
              )}
            </div>
          )}

          {/* Unassigned portfolio badges (draggable) */}
          {unassignedPortfolios.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 9, fontWeight: 700,
                color: '#2a4a6a', letterSpacing: '0.15em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                UNASSIGNED ·
              </span>
              {unassignedPortfolios.map(p => (
                <div key={p.id}
                  draggable
                  onDragStart={() => handleDragStart(p.id)}
                  onDragEnd={handleDragEnd}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '3px 8px',
                    borderRadius: 10, whiteSpace: 'nowrap', cursor: draggingPortfolio === p.id ? 'grabbing' : 'grab',
                    background: p.bg, border: `1px solid ${p.border}`, color: p.color,
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                    opacity: draggingPortfolio === p.id ? 0.5 : 1,
                    transition: 'opacity 0.15s', userSelect: 'none' }}>
                  <GripVertical size={9} style={{ opacity: 0.5 }} />
                  {p.icon} {p.id}
                </div>
              ))}
              {cabinet.length > 0 && (
                <span style={{ fontSize: 9, color: '#2a4a6a', fontStyle: 'italic',
                  fontFamily: "'Rajdhani', sans-serif', letterSpacing: '0.05em'" }}>
                  ← drag onto a minister to assign
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN 3-COLUMN ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* ── LEFT: Mayor's Desk ───────────────────────────────────────────── */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid #1c3652',
          background: 'linear-gradient(180deg, #071320 0%, #050e1c 100%)' }}>

          <div style={{ padding: '11px 16px 9px', borderBottom: '1px solid #1c3652', flexShrink: 0 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
              letterSpacing: '0.2em', color: '#4b6280' }}>CANDIDATE PROFILE</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!interviewee ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 12, padding: 32, textAlign: 'center' }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, color: '#1c3652',
                  letterSpacing: '0.12em', lineHeight: 1.8 }}>
                  SELECT A CANDIDATE<br />FROM THE MIDDLE TO REVIEW<br />THEIR PROFILE
                </div>
              </div>
            ) : (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Candidate identity */}
                <div style={{ background: 'linear-gradient(180deg, rgba(232,160,48,0.07) 0%, rgba(7,16,28,0.8) 100%)',
                  border: '1px solid rgba(232,160,48,0.25)', borderRadius: 8, padding: 14 }}>
                  <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 12 }}>
                    <CandidateAvatar name={interviewee.name} size={60} borderColor="#e8a030" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16,
                        color: '#f0c040', lineHeight: 1.1 }}>{interviewee.name}</div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>
                        {interviewee.demographics.profession}
                      </div>
                      <div style={{ fontSize: 9, color: '#4b6280', marginTop: 1 }}>
                        {interviewee.demographics.age_group}
                        {interviewee.demographics.location ? ` · ${interviewee.demographics.location}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {interviewee.demographics.ideology_economic && (
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4,
                            background: 'rgba(56,189,248,0.1)', border: '1px solid #0c4a6e',
                            color: '#7dd3fc', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                            {interviewee.demographics.ideology_economic}
                          </span>
                        )}
                        {interviewee.demographics.ideology_social && (
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4,
                            background: 'rgba(167,139,250,0.1)', border: '1px solid #4c1d95',
                            color: '#c4b5fd', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                            {interviewee.demographics.ideology_social}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 6, fontFamily: "'Rajdhani', sans-serif", fontSize: 9,
                    letterSpacing: '0.15em', color: '#2a4a6a', fontWeight: 700 }}>CAPABILITY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    <StatBar label="Competence" value={cap?.competence ?? 50} />
                    <StatBar label="Managerial Skill" value={cap?.managerial_skill ?? 50} />
                    <StatBar label="Strategic Thinking" value={cap?.strategic_thinking ?? 50} />
                    <StatBar label="Crisis Handling" value={cap?.crisis_handling ?? 50} />
                    <StatBar label="Bureaucratic Nav." value={cap?.bureaucratic_navigation ?? 50} />
                  </div>

                  <div style={{ marginBottom: 6, fontFamily: "'Rajdhani', sans-serif", fontSize: 9,
                    letterSpacing: '0.15em', color: '#2a4a6a', fontWeight: 700 }}>PERSONALITY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <StatBar label="Integrity" value={p?.integrity ?? 50} />
                    <StatBar label="Ambition" value={p?.ambition ?? 50} />
                    <StatBar label="Empathy" value={p?.empathy ?? 50} />
                    <StatBar label="Risk Appetite" value={p?.risk_appetite ?? 50} />
                  </div>
                </div>

                {/* Portfolio selection */}
                <div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.18em', color: '#4b6280', marginBottom: 7 }}>
                    ASSIGN PORTFOLIOS
                    {selectedPortfolios.size > 0 && (
                      <span style={{ marginLeft: 8, color: '#e8a030' }}>· {selectedPortfolios.size} selected</span>
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
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px',
                            borderRadius: 5, cursor: isAssigned ? 'not-allowed' : 'pointer',
                            background: isSelected ? pf.bg : isAssigned ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
                            border: isSelected ? `1.5px solid ${pf.color}` : isAssigned ? '1px solid rgba(28,54,82,0.2)' : '1px solid #1a2f44',
                            opacity: isAssigned ? 0.3 : 1, transition: 'all 0.15s',
                            textAlign: 'left', outline: 'none',
                            boxShadow: isSelected ? `0 0 8px ${pf.color}33` : 'none' }}
                          onMouseEnter={e => { if (!isAssigned && !isSelected) e.currentTarget.style.borderColor = pf.color + '66' }}
                          onMouseLeave={e => { if (!isAssigned && !isSelected) e.currentTarget.style.borderColor = '#1a2f44' }}>
                          <span style={{ fontSize: 12, lineHeight: 1 }}>{pf.icon}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1.2,
                            fontFamily: "'Rajdhani', sans-serif",
                            color: isAssigned ? '#334155' : isSelected ? pf.color : '#94a3b8' }}>
                            {pf.id}
                          </span>
                          {isAssigned && <Check size={9} color="#334155" style={{ marginLeft: 'auto' }} />}
                          {isSelected && <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%',
                            background: pf.color, boxShadow: `0 0 4px ${pf.color}` }} />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Appoint + Dismiss */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={handleAppoint}
                    disabled={selectedPortfolios.size === 0}
                    style={{ width: '100%', padding: '9px 0', borderRadius: 6,
                      background: selectedPortfolios.size > 0 ? 'linear-gradient(135deg, #c47d10, #e8a030)' : '#0a1828',
                      border: selectedPortfolios.size > 0 ? '1px solid rgba(255,200,60,0.4)' : '1px solid #1c3652',
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em',
                      color: selectedPortfolios.size > 0 ? '#040d1b' : '#334155',
                      cursor: selectedPortfolios.size > 0 ? 'pointer' : 'not-allowed',
                      boxShadow: selectedPortfolios.size > 0 ? '0 0 14px rgba(232,160,48,0.25)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      transition: 'all 0.2s' }}>
                    <Briefcase size={12} />
                    {selectedPortfolios.size > 0
                      ? `APPOINT (${selectedPortfolios.size} PORTFOLIO${selectedPortfolios.size > 1 ? 'S' : ''})`
                      : 'SELECT PORTFOLIOS FIRST'}
                  </button>
                  <button onClick={() => { setInterviewee(null); setSelectedPortfolios(new Set()) }}
                    style={{ width: '100%', padding: '6px 0', borderRadius: 5, background: 'none',
                      border: '1px solid #1c3652', color: '#4b6280', cursor: 'pointer',
                      fontFamily: "'Rajdhani', sans-serif", fontSize: 10, letterSpacing: '0.1em',
                      transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#f87171'; e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1c3652'; e.currentTarget.style.color = '#4b6280' }}>
                    CLOSE
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ── MIDDLE: Candidates ───────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ padding: '11px 16px 7px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, #1c3652)' }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
              letterSpacing: '0.22em', color: '#2a4a6a', whiteSpace: 'nowrap' }}>
              APPLICANTS — {waitingCandidates.length}
            </span>
            <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, #1c3652, transparent)' }} />
            <button
              onClick={handleRandomCabinet}
              disabled={candidates.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded transition-all"
              style={{ border: '1px solid #1c3652', fontSize: 9, color: '#e8a030',
                fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em', fontWeight: 700,
                background: 'rgba(232,160,48,0.06)', cursor: 'pointer', whiteSpace: 'nowrap',
                opacity: candidates.length === 0 ? 0.4 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,160,48,0.15)'; e.currentTarget.style.borderColor = '#e8a030' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(232,160,48,0.06)'; e.currentTarget.style.borderColor = '#1c3652' }}
            >
              <Shuffle size={10} /> RANDOM CABINET
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 16px',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 9,
            alignContent: 'start' }}>
            {waitingCandidates.map((c, idx) => {
              const cap2 = c.capability as Record<string, number>
              const p2 = c.personality as Record<string, number>
              const comp = cap2.competence ?? 50
              const integ = p2.integrity ?? 50
              const amb = p2.ambition ?? 50
              const isSelected = interviewee?.id === c.id

              return (
                <div key={c.id}
                  onClick={() => handleCallToDesk(c)}
                  style={{
                    cursor: 'pointer', userSelect: 'none',
                    background: isSelected
                      ? 'linear-gradient(180deg, rgba(232,160,48,0.1) 0%, rgba(10,24,40,0.95) 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(7,16,28,0.9) 100%)',
                    border: isSelected ? '1px solid rgba(232,160,48,0.5)' : '1px solid #1c3652',
                    borderTop: isSelected ? '2px solid #e8a030' : '2px solid #1c3652',
                    borderRadius: 8, padding: '12px 9px 9px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    transition: 'all 0.18s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = '#2a4a6a'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = '#1c3652'
                      e.currentTarget.style.transform = ''
                    }
                  }}>

                  <div style={{ position: 'relative' }}>
                    <CandidateAvatar name={c.name} size={48} borderColor={isSelected ? '#e8a030' : '#1c3652'} />
                    <div style={{ position: 'absolute', bottom: -3, right: -3, width: 14, height: 14,
                      borderRadius: '50%', background: '#0a1828', border: '1px solid #1c3652',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 7, fontFamily: "'Share Tech Mono', monospace", color: '#4b6280' }}>
                      {idx + 1}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <div style={{ fontWeight: 700, fontSize: 10, color: isSelected ? '#f0c040' : '#e2e8f0',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 9, color: '#4b6280', marginTop: 1, fontStyle: 'italic',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.demographics.profession}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 2, width: '100%' }}>
                    {[
                      { label: 'C', val: comp },
                      { label: 'I', val: integ },
                      { label: 'A', val: amb },
                    ].map(({ label, val }) => {
                      const col = val >= 70 ? '#22c55e' : val >= 45 ? '#e8a030' : '#f87171'
                      return (
                        <div key={label} style={{ flex: 1, textAlign: 'center',
                          background: 'rgba(0,0,0,0.3)', borderRadius: 3, padding: '1px 0' }}>
                          <div style={{ fontSize: 7, color: '#334155', fontFamily: "'Rajdhani', sans-serif" }}>{label}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace",
                            color: col }}>{Math.round(val)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {waitingCandidates.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0',
                color: '#1c3652', fontSize: 12 }}>
                All candidates have been appointed.
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: City Intel ────────────────────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid #1c3652', overflow: 'hidden',
          background: 'linear-gradient(180deg, #071320 0%, #050e1c 100%)' }}>

          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* Active Issues */}
            <div style={{ padding: '11px 14px 0' }}>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
                letterSpacing: '0.2em', color: '#f87171', marginBottom: 8 }}>
                ACTIVE CITY ISSUES
              </div>
              {state.active_events.length === 0 ? (
                <div style={{ fontSize: 11, color: '#1c3652', padding: '8px 0 12px', fontStyle: 'italic' }}>
                  No active issues
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {state.active_events.slice(0, 5).map(ev => {
                    const isCrisis = ev.type === 'crisis'
                    const sevColor = ev.severity >= 70 ? '#f87171' : ev.severity >= 40 ? '#fb923c' : '#fbbf24'
                    return (
                      <div key={ev.id} style={{
                        padding: '8px 10px', borderRadius: 6,
                        background: isCrisis ? 'rgba(248,113,113,0.06)' : 'rgba(34,197,94,0.06)',
                        border: `1px solid ${isCrisis ? '#7f1d1d' : '#14532d'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 700,
                              color: isCrisis ? '#fca5a5' : '#86efac', lineHeight: 1.3 }}>{ev.name}</div>
                            {ev.portfolio && (
                              <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{ev.portfolio}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3,
                              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                              color: sevColor,
                              background: `${sevColor}18`, border: `1px solid ${sevColor}44` }}>
                              {ev.severity >= 70 ? 'HIGH' : ev.severity >= 40 ? 'MED' : 'LOW'}
                            </span>
                            <span style={{ fontSize: 8, color: '#475569', fontFamily: "'Share Tech Mono', monospace" }}>
                              {ev.turns_remaining}T left
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ height: 1, background: '#1c3652', margin: '0 14px' }} />

            {/* City Parameters */}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 10, fontWeight: 700,
                letterSpacing: '0.2em', color: '#4b6280', marginBottom: 10 }}>
                CITY PARAMETERS
              </div>

              {/* Layer A */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                  color: '#38bdf8', fontWeight: 700, marginBottom: 5 }}>LAYER A · ECONOMIC & INFRASTRUCTURE</div>
                {[
                  { label: 'Jobs & Commerce', val: state.city_params.jobs_and_commerce },
                  { label: 'Transit & Roads', val: state.city_params.transit_and_roads },
                  { label: 'Water / Power / Sanitation', val: state.city_params.water_power_sanitation },
                ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#38bdf8" />)}
              </div>

              {/* Layer B */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                  color: '#a78bfa', fontWeight: 700, marginBottom: 5 }}>LAYER B · HUMAN & SOCIAL</div>
                {[
                  { label: 'Hospitals & Clinics', val: state.city_params.hospitals_and_clinics },
                  { label: 'Schools & Universities', val: state.city_params.schools_and_universities },
                  { label: 'Affordable Housing', val: state.city_params.affordable_housing },
                  { label: 'Community & Spaces', val: state.city_params.community_and_spaces },
                ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#a78bfa" />)}
              </div>

              {/* Layer C */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                  color: '#4ade80', fontWeight: 700, marginBottom: 5 }}>LAYER C · SAFETY & ENVIRONMENT</div>
                {[
                  { label: 'Police & Emergency', val: state.city_params.police_and_emergency },
                  { label: 'Courts & Legal', val: state.city_params.courts_and_legal },
                  { label: 'Air Quality & Pollution', val: state.city_params.air_quality_and_pollution },
                ].map(({ label, val }) => <CityParamRow key={label} label={label} value={val} accent="#4ade80" />)}
              </div>

              {/* Layer D — highlighted */}
              <div style={{ background: 'rgba(232,160,48,0.05)', border: '1px solid rgba(232,160,48,0.2)',
                borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
                  color: '#e8a030', fontWeight: 700, marginBottom: 6 }}>LAYER D · GOVERNANCE (META)</div>
                <div style={{ fontSize: 9, color: '#64748b', fontStyle: 'italic', marginBottom: 7, lineHeight: 1.4 }}>
                  These determine how effectively your policies execute.
                </div>
                {[
                  { label: 'Admin Efficiency', val: state.city_params.admin_efficiency,
                    desc: 'The Filter — policy execution rate' },
                  { label: 'Anti-Corruption', val: state.city_params.anti_corruption,
                    desc: 'The Plug — budget leakage' },
                  { label: 'Media Freedom', val: state.city_params.media_freedom,
                    desc: 'The Spotlight — accountability' },
                ].map(({ label, val, desc }) => (
                  <div key={label} style={{ marginBottom: 7 }}>
                    <CityParamRow label={label} value={val} accent="#e8a030" />
                    <div style={{ fontSize: 8, color: '#334155', marginTop: 2, fontStyle: 'italic' }}>{desc}</div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Error toast */}
      {error && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: 'rgba(127,29,29,0.98)', border: '1px solid #f87171',
          borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <AlertTriangle size={14} color="#f87171" />
          <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none',
            color: '#f87171', cursor: 'pointer', marginLeft: 8 }}>✕</button>
        </div>
      )}
    </div>
  )
}
