import { useState, useRef, useEffect } from 'react'
import {
  ChevronRight, ChevronDown, HelpCircle, Settings, Clock, SkipForward,
  Zap, Send, AlertTriangle, TrendingDown, Droplets,
  MapPin, Info,
  Newspaper, MessageCircle, TrendingUp, Loader2,
} from 'lucide-react'
import {
  openConsultation, messageMinister, closeConsultation,
  getPolicies, executeTurn,
} from '../api'
import type {
  GameState, TurnResult, Policy, Minister, ActiveEvent,
  MediaHeadline, CitizenVoice, WardReportEntry,
  GovernanceScorecard,
} from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const PANEL = {
  background: 'linear-gradient(180deg, #0b1929 0%, #091422 100%)',
  border: '1px solid #1c3652',
  borderRadius: 6,
} as const

const HDR_LABEL = {
  fontFamily: "'Rajdhani', sans-serif",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.15em',
  color: '#e8a030',
} as const

const MONO = (color = '#fff') => ({
  fontFamily: "'Share Tech Mono', monospace",
  color,
} as const)

function avg(vals: number[]) {
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ seed, size = 28, ring = '#1c3652' }: { seed: string; size?: number; ring?: string }) {
  return (
    <img
      src={`https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1e3a5f,0f2942,1a2f4a`}
      alt={seed}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: `1.5px solid ${ring}`, background: '#0b1929' }}
    />
  )
}

// ─── LoyaltyArc ───────────────────────────────────────────────────────────────

function LoyaltyArc({ value, color }: { value: number; color: string }) {
  const r = 13
  const circ = 2 * Math.PI * r
  const fill = (Math.max(0, Math.min(100, value)) / 100) * circ
  return (
    <svg width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r={r} fill="none" stroke="#0a1a30" strokeWidth="4" />
      <circle
        cx="17" cy="17" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${fill} ${circ}`}
        transform="rotate(-90 17 17)"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      <text x="17" y="21" textAnchor="middle" fill="white" fontSize="8" fontWeight="700"
        fontFamily="Share Tech Mono">{Math.round(value)}</text>
    </svg>
  )
}

// ─── WelfareRing ──────────────────────────────────────────────────────────────

interface WelfareStat {
  label: string; score: number; delta: number
  stroke: string; glow: string; trackColor: string
  gradientId: string; gradientFrom: string; gradientTo: string
  symbol: string; bg: string
}

function WelfareRing({ stat }: { stat: WelfareStat }) {
  const R = 30
  const circ = 2 * Math.PI * R
  const fill = (Math.max(0, Math.min(100, stat.score)) / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg relative overflow-hidden"
      style={{ background: stat.bg, border: `1px solid ${stat.stroke}33`, flex: 1 }}>
      <div className="absolute top-0 left-0 right-0"
        style={{ height: 2, background: `linear-gradient(90deg, ${stat.gradientFrom}, ${stat.gradientTo})` }} />
      <div style={{ position: 'relative', width: 74, height: 74 }}>
        <svg viewBox="0 0 74 74" width="74" height="74">
          <defs>
            <linearGradient id={stat.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={stat.gradientFrom} />
              <stop offset="100%" stopColor={stat.gradientTo} />
            </linearGradient>
          </defs>
          <circle cx="37" cy="37" r={R} fill="none" stroke={stat.trackColor} strokeWidth="7" />
          <circle cx="37" cy="37" r={R} fill="none"
            stroke={`url(#${stat.gradientId})`} strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${fill} ${circ}`}
            transform="rotate(-90 37 37)"
            style={{ filter: `drop-shadow(0 0 6px ${stat.glow})` }}
          />
          {/* Symbol in center */}
          <text x="37" y="33" textAnchor="middle" fontSize="14" fill={stat.stroke}>{stat.symbol}</text>
          {/* Score in center */}
          <text x="37" y="50" textAnchor="middle" fontSize="14" fontWeight="700"
            fontFamily="Share Tech Mono" fill="white">{Math.round(stat.score)}</text>
        </svg>
      </div>
      <div className="flex items-center gap-1">
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace",
          color: stat.delta >= 0 ? '#22c55e' : '#f87171'
        }}>
          {stat.delta >= 0 ? `▲ +${Math.round(stat.delta)}` : `▼ ${Math.round(stat.delta)}`}
        </span>
      </div>
      <span className="text-gray-400"
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
          fontFamily: "'Rajdhani', sans-serif", textTransform: 'uppercase'
        }}>
        {stat.label}
      </span>
    </div>
  )
}

// ─── MiniBar ──────────────────────────────────────────────────────────────────

function MiniBar({ value, color, width = 36 }: { value: number; color: string; width?: number }) {
  return (
    <div style={{ width, height: 4, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
        background: color, borderRadius: 2, boxShadow: `0 0 4px ${color}80`
      }} />
    </div>
  )
}

// ─── Scorecard Overlay ────────────────────────────────────────────────────────

function ScorecardOverlay({ sc }: { sc: GovernanceScorecard }) {
  const rows: [string, number][] = [
    ['Final Approval', sc.final_approval],
    ['Wellbeing Equity', sc.wellbeing_equity],
    ['Institutional Legacy', sc.institutional_legacy],
    ['Budget Health', sc.budget_health],
    ['Crisis Record', sc.crisis_record],
    ['Promise Delivery', sc.promise_delivery],
    ['Cabinet Integrity', sc.cabinet_integrity],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(5,13,27,0.95)', backdropFilter: 'blur(8px)' }}>
      <div style={{ ...PANEL, maxWidth: 480, width: '100%', padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, ...MONO('#e8a030'), letterSpacing: '0.2em', marginBottom: 4 }}>GAME OVER</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 28, color: '#f0c040',
            letterSpacing: '0.06em', textShadow: '0 0 12px rgba(240,192,64,0.5)'
          }}>
            {sc.legacy_title}
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, ...MONO('#22c55e'), marginTop: 8 }}>
            {Math.round(sc.final_score)}
          </div>
          <div style={{ ...HDR_LABEL, marginTop: 2 }}>FINAL SCORE</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {rows.map(([label, val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 11, color: '#94a3b8' }}>{label}</span>
              <div style={{ width: 100, height: 4, background: '#0a1a30', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${val}%`, background: '#e8a030',
                  borderRadius: 2, boxShadow: '0 0 4px #e8a03080'
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, ...MONO('#f0c040'), width: 28, textAlign: 'right' }}>
                {Math.round(val)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6, textAlign: 'center' }}>
          {sc.summary}
        </div>
      </div>
    </div>
  )
}

// ─── Policy Modal ─────────────────────────────────────────────────────────────

function PolicyModal({
  options, onSelect, onClose, loading, error,
}: {
  options: Policy[]; onSelect: (i: number) => void; onClose: () => void; loading: boolean; error: string | null
}) {
  const PORTFOLIO_COLORS: Record<string, string> = {
    'Health': '#22c55e', 'Infrastructure': '#38bdf8', 'Transport & Roads': '#38bdf8',
    'Education': '#a855f7', 'Housing': '#f97316', 'Security & Law': '#f87171',
    'Environment': '#4ade80', 'Water & Power': '#60a5fa', 'Commerce': '#eab308',
    'Labor & Employment': '#fb923c',
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(5,13,27,0.85)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...PANEL, width: '90%', maxWidth: 860, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={HDR_LABEL}>SELECT POLICY FOR THIS TURN</span>
          <button onClick={onClose} disabled={loading}
            style={{ color: '#4b6280', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: 'rgba(248,113,113,0.1)', border: '1px solid #7f1d1d', borderRadius: 4,
            marginBottom: 16, fontSize: 11, color: '#f87171'
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {options.map((p, i) => {
            const col = PORTFOLIO_COLORS[p.portfolio] ?? '#e8a030'
            const topEffects = Object.entries(p.target_effects).slice(0, 3)
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid #1c3652`,
                borderRadius: 6, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10
              }}>
                <div>
                  <span style={{
                    fontSize: 8, fontWeight: 700, color: col, background: `${col}22`,
                    border: `1px solid ${col}44`, borderRadius: 3, padding: '1px 6px',
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em'
                  }}>
                    {p.portfolio}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 6, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>{p.description}</div>
                </div>
                <div style={{ fontSize: 11, ...MONO('#f87171') }}>
                  Budget: ₹{fmtNum(p.budget_cost)} Cr
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {topEffects.map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9, fontFamily: "'Share Tech Mono', monospace",
                      color: (v as number) >= 0 ? '#4ade80' : '#f87171',
                      background: (v as number) >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                      border: `1px solid ${(v as number) >= 0 ? '#14532d' : '#7f1d1d'}`,
                      borderRadius: 3, padding: '1px 5px'
                    }}>
                      {k.replace(/_/g, ' ')} {(v as number) >= 0 ? '+' : ''}{v as number}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onSelect(i)}
                  disabled={loading}
                  style={{
                    marginTop: 'auto', background: loading ? '#1a2a3a' : 'linear-gradient(135deg, #c47d10, #e8a030)',
                    border: 'none', borderRadius: 4, padding: '8px 0', color: loading ? '#4b6280' : '#040d1b',
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12,
                    letterSpacing: '0.08em', cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 6
                  }}>
                  {loading ? <><Loader2 size={13} className="animate-spin" /> EXECUTING...</> : 'EXECUTE POLICY'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Types used internally ────────────────────────────────────────────────────

interface ChatMsg {
  isMayor: boolean
  sender: string
  senderRole: string
  text: string
  time: string
  ringColor: string
  seed: string
}

interface TurnEntry {
  turn: number
  result: TurnResult
  expanded: boolean
}

// ─── Portfolio image map ───────────────────────────────────────────────────────

const PORTFOLIO_IMG: Record<string, string> = {
  'Infrastructure': 'https://images.unsplash.com/photo-1544621531-97b77ab684cb?q=80&w=1200&auto=format&fit=crop',
  'Health & Education': 'https://images.unsplash.com/photo-1551076805-e1869033e561?q=80&w=1200&auto=format&fit=crop',
  'Finance & Economy': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop',
  'Home Affairs': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1200&auto=format&fit=crop',
  'Housing & Community': 'https://images.unsplash.com/photo-1580216643062-cf460548a66a?q=80&w=1200&auto=format&fit=crop',
  'Environment': 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1200&auto=format&fit=crop',
  'Governance Reform': 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1200&auto=format&fit=crop',

  // Fallbacks
  'Transport & Roads': 'https://images.unsplash.com/photo-1544621531-97b77ab684cb?q=80&w=1200&auto=format&fit=crop',
  'Health': 'https://images.unsplash.com/photo-1551076805-e1869033e561?q=80&w=1200&auto=format&fit=crop',
  'Education': 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1200&auto=format&fit=crop',
  'Housing': 'https://images.unsplash.com/photo-1580216643062-cf460548a66a?q=80&w=1200&auto=format&fit=crop',
  'Security & Law': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1200&auto=format&fit=crop',
  'Water & Power': 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop',
  'Commerce': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop',
  'Labor & Employment': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop',
}
const DEFAULT_IMG = 'https://images.unsplash.com/photo-1596430212278-7f7b1d0c9a4e?q=80&w=1200&auto=format&fit=crop'

// ─── Welfare score helpers ────────────────────────────────────────────────────

function deriveWelfare(cp: GameState['city_params']) {
  return {
    health: avg([cp.hospitals_and_clinics, cp.air_quality_and_pollution]),
    wealth: avg([cp.jobs_and_commerce, cp.affordable_housing]),
    safety: avg([cp.police_and_emergency, cp.courts_and_legal]),
    social: avg([cp.community_and_spaces, cp.schools_and_universities]),
  }
}

function welfareDelta(after: Record<string, number>, before: Record<string, number>) {
  const avgBefore = (keys: string[]) => avg(keys.map(k => before[k] ?? 50))
  const avgAfter = (keys: string[]) => avg(keys.map(k => after[k] ?? 50))
  return {
    health: avgAfter(['hospitals_and_clinics', 'air_quality_and_pollution']) - avgBefore(['hospitals_and_clinics', 'air_quality_and_pollution']),
    wealth: avgAfter(['jobs_and_commerce', 'affordable_housing']) - avgBefore(['jobs_and_commerce', 'affordable_housing']),
    safety: avgAfter(['police_and_emergency', 'courts_and_legal']) - avgBefore(['police_and_emergency', 'courts_and_legal']),
    social: avgAfter(['community_and_spaces', 'schools_and_universities']) - avgBefore(['community_and_spaces', 'schools_and_universities']),
  }
}

function severityLabel(s: number): { label: string; bg: string; border: string; color: string } {
  if (s >= 70) return { label: 'HIGH', bg: 'rgba(239,68,68,0.15)', border: '#7f1d1d', color: '#f87171' }
  if (s >= 40) return { label: 'MEDIUM', bg: 'rgba(249,115,22,0.15)', border: '#7c2d12', color: '#fb923c' }
  return { label: 'LOW', bg: 'rgba(34,197,94,0.1)', border: '#14532d', color: '#4ade80' }
}

const MINISTER_COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#d97706', '#be185d']

// Detect @mention or direct name reference in a message.
// Returns array of minister indices that should respond.
function detectMentioned(msg: string, ministers: Minister[]): number[] {
  const lower = msg.toLowerCase()
  const mentioned: number[] = []
  ministers.forEach((m, idx) => {
    const parts = m.name.toLowerCase().split(' ')
    // Match @FirstName, @FullName, or just the first/last name in text
    if (
      lower.includes(`@${parts[0]}`) ||
      lower.includes(`@${m.name.toLowerCase().replace(' ', '')}`) ||
      lower.includes(parts[0]) ||
      (parts[1] && lower.includes(parts[1]))
    ) {
      mentioned.push(idx)
    }
  })
  return mentioned
}

// Pick 2-3 ministers to respond when no specific mention (natural council feel)
function pickResponders(ministers: Minister[], excludeIndices: number[] = []): number[] {
  const pool = ministers
    .map((_, i) => i)
    .filter(i => !excludeIndices.includes(i))
  // Shuffle and pick 2
  const shuffled = pool.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(2, shuffled.length))
}


function ExecScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#e8a030' : '#f87171'
  return (
    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace",
      color, background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 3, padding: '1px 5px' }}>
      {pct}% EXEC
    </span>
  )
}

// ─── TurnPhaseCard helpers ──────────────────────────────────────────────────────

function findMinisterForPortfolio(ministers: Minister[], portfolio: string): Minister | undefined {
  return ministers.find(m => m.portfolio === portfolio || m.extra_portfolios?.includes(portfolio))
}

// ─── TurnPhaseCard ─────────────────────────────────────────────────────────────

function TurnPhaseCard({
  entry, ministers, onToggle,
}: {
  entry: TurnEntry; ministers: Minister[]; onToggle: () => void
}) {
  const tr = entry.result
  const paramDeltas = tr.city_params_after && tr.city_params_before
    ? Object.entries(tr.city_params_after)
        .map(([k, v]) => ({ key: k, diff: Math.round(v - (tr.city_params_before[k] ?? v)) }))
        .filter(d => Math.abs(d.diff) >= 1)
    : []

  return (
    <div style={{ borderBottom: '1px solid #1c3652' }}>
      {/* Header — always visible */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all"
        style={{ background: entry.expanded ? 'rgba(255,255,255,0.02)' : '' }}
        onMouseEnter={e => { if (!entry.expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        onMouseLeave={e => { if (!entry.expanded) e.currentTarget.style.background = '' }}
      >
        <div className="shrink-0">
          {entry.expanded
            ? <ChevronDown size={12} color="#4b6280" />
            : <ChevronRight size={12} color="#4b6280" />}
        </div>
        <div className="shrink-0 px-2 py-0.5 rounded"
          style={{ background: 'rgba(232,160,48,0.12)', border: '1px solid rgba(232,160,48,0.3)',
            fontSize: 9, fontWeight: 700, color: '#e8a030',
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>
          TURN {tr.turn}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', flex: 1, minWidth: 0 }} className="truncate">
          {tr.major_policy?.name ?? 'Policy Executed'}
        </span>
        <ExecScoreBadge score={tr.execution_score} />
      </div>

      {/* Expanded numbered sections */}
      {entry.expanded && (() => {
        const execPct = Math.round(tr.execution_score * 100)
        const execColor = tr.execution_score >= 0.7 ? '#22c55e' : tr.execution_score >= 0.45 ? '#e8a030' : '#f87171'
        const netTreasury = (tr.tax_revenue ?? 0) - (tr.major_policy?.budget_cost ?? 0) - (tr.interest_paid ?? 0) - (tr.budget_stolen ?? 0)
        const sideEffectEntries = Object.entries(tr.side_effect_deltas ?? {}).filter(([,v]) => Math.abs(v) >= 0.5)
        const fmt = (k: string) => k.replace(/_/g, ' ')

        // ── Dynamic reasoning helpers ──────────────────────────────────────────
        const execMinister = findMinisterForPortfolio(ministers, tr.major_policy?.portfolio ?? '')
        const cap = execMinister?.capability as Record<string, number> | undefined
        const pers = execMinister?.personality as Record<string, number> | undefined
        const p = tr.city_params_before ?? {}

        // Approximate minister score (mirrors engine formula)
        const portfolioCount = 1 + (execMinister?.extra_portfolios?.length ?? 0)
        const mScoreRaw = execMinister && cap && pers
          ? ((cap.competence ?? 50) * 0.35 + (cap.managerial_skill ?? 50) * 0.30
            + (pers.conscientiousness ?? 50) * 0.20 + (cap.bureaucratic_navigation ?? 50) * 0.15) / 100
          : null
        const mPenalty = portfolioCount >= 3 ? 0.75 : portfolioCount === 2 ? 0.85 : 1.0
        const mScore = mScoreRaw !== null ? mScoreRaw * mPenalty : null

        // Approximate city filter score
        const instBase = ((p.courts_and_legal ?? 50) * 0.40 + (p.schools_and_universities ?? 50) * 0.35
          + (p.police_and_emergency ?? 50) * 0.25) / 100 * 100
        const cScore = ((p.admin_efficiency ?? 50) * 0.40 + (p.anti_corruption ?? 50) * 0.30 + instBase * 0.30) / 100

        const execReason = (() => {
          const pct = Math.round(tr.execution_score * 100)
          const name = execMinister?.name?.split(' ')[0] ?? 'Minister'
          const comp = Math.round(cap?.competence ?? 50)
          const adminEff = Math.round(p.admin_efficiency ?? 50)

          if (pct >= 75) {
            if (mScore && mScore > 0.7 && cScore > 0.6)
              return `${name} (competence ${comp}) and strong city institutions aligned — smooth delivery`
            return `${name}'s solid capabilities overcame moderate city constraints`
          }
          if (portfolioCount >= 3)
            return `${name} is juggling ${portfolioCount} portfolios — 25% penalty applied`
          if (portfolioCount === 2)
            return `${name} managing two portfolios took a 15% efficiency hit this turn`
          if (mScore && mScore < 0.5 && cScore > 0.6)
            return `City institutions were ready, but ${name}'s capability (competence ${comp}) was the bottleneck`
          if (mScore && mScore > 0.6 && cScore < 0.45)
            return `${name} was capable, but admin efficiency (${adminEff}) and weak institutions slowed delivery`
          if (adminEff < 35)
            return `Bureaucratic breakdown — admin efficiency at ${adminEff} made every step harder`
          if (mScore && mScore < 0.45)
            return `${name}'s competence (${comp}) couldn't overcome the policy complexity`
          return `Moderate delivery — both ${name} and city systems had room to improve`
        })()

        const budgetReason = (() => {
          const stolen = tr.budget_stolen ?? 0
          const taxRev = tr.tax_revenue ?? 0
          const policyCost = tr.major_policy?.budget_cost ?? 0
          const intPaid = tr.interest_paid ?? 0
          const net = taxRev - policyCost - intPaid - stolen
          const intPct = taxRev > 0 ? Math.round((intPaid / taxRev) * 100) : 0

          if (stolen > 10) {
            const integrity = Math.round(pers?.integrity ?? 50)
            const antiCorr = Math.round(p.anti_corruption ?? 50)
            return `₹${fmtNum(stolen)} Cr leaked — ${execMinister?.name?.split(' ')[0] ?? 'minister'} integrity (${integrity}) + anti-corruption at ${antiCorr} opened the window`
          }
          if (stolen > 2) {
            const hints: string[] = []
            if ((pers?.integrity ?? 100) < 50) hints.push('low integrity')
            if ((p.police_and_emergency ?? 100) < 45) hints.push('weak enforcement')
            if ((p.anti_corruption ?? 100) < 45) hints.push('poor oversight')
            return `Minor leakage — ${hints.join(', ')} created a small corruption window`
          }
          if (intPaid > 0 && intPct > 40)
            return `Debt servicing consumed ${intPct}% of tax revenue — outstanding debt is straining the treasury`
          if (net >= 0)
            return `Revenue covered all costs — net gain of ₹${fmtNum(net)} Cr this turn`
          return `Policy cost exceeded revenue — treasury drew down by ₹${fmtNum(Math.abs(net))} Cr`
        })()

        const paramReason = (() => {
          const neg = paramDeltas.filter(d => d.diff < 0).map(d => fmt(d.key))
          const pos = paramDeltas.filter(d => d.diff > 0).map(d => fmt(d.key))
          const negSE = sideEffectEntries.filter(([,v]) => v < 0).map(([k]) => fmt(k))
          const policyName = tr.major_policy?.name ?? 'the policy'
          if (pos.length > 0 && negSE.length > 0)
            return `${policyName} boosted ${pos[0]}, but spilled into ${negSE.slice(0,2).join(', ')} — unintended consequences`
          if (pos.length > 0 && neg.length === 0)
            return `Clean execution — targeted gains with no adverse side effects this turn`
          if (neg.length > 0 && pos.length === 0)
            return `${neg[0]} resisted improvement — city conditions in this sector are entrenched`
          return `Mixed impact — some parameters moved, others absorbed the intervention`
        })()

        const attackDetail = (() => {
          const attack = tr.opposition_attack ?? ''
          const pct = Math.round(tr.execution_score * 100)
          const tension = Math.round(tr.communal_tension_after ?? 0)
          const debtAfter = tr.outstanding_debt_after ?? 0
          const stolen = tr.budget_stolen ?? 0
          const crises = tr.events_triggered?.filter(e => e.type === 'crisis').length ?? 0
          if (attack.toLowerCase().includes('delivery') || attack.toLowerCase().includes('failure'))
            return `Execution was ${pct}% — opposition citing poor delivery`
          if (attack.toLowerCase().includes('corruption'))
            return stolen > 0 ? `Corruption window: ₹${fmtNum(stolen)} Cr leaked this turn` : `Corruption window opened — cabinet integrity under scrutiny`
          if (attack.toLowerCase().includes('crisis') || attack.toLowerCase().includes('blame'))
            return `${crises > 0 ? crises : 'Active'} crisis${crises !== 1 ? 'es' : ''} this turn — opposition demanding accountability`
          if (attack.toLowerCase().includes('fiscal') || attack.toLowerCase().includes('debt'))
            return `Outstanding debt ₹${fmtNum(debtAfter)} Cr — opposition calling it reckless`
          if (attack.toLowerCase().includes('populist') || attack.toLowerCase().includes('promise'))
            return `Opposition bypassing policy debate with direct voter promises`
          if (attack.toLowerCase().includes('identity') || attack.toLowerCase().includes('mobiliz'))
            return `Communal tension at ${tension} — opposition exploiting divisions`
          return `Opposition adapted their strategy to current city vulnerabilities`
        })()

        const counterDetail = (() => {
          const cur = Math.round(tr.interim_approval)
          const prev = Math.round(tr.approval_before ?? tr.interim_approval)
          const delta = cur - prev
          const sign = delta > 0 ? '+' : ''
          if (delta > 2) return `approval ${sign}${delta}% — framing resonated with voters`
          if (delta >= 0) return `approval ${sign}${delta}% — holding ground`
          return `approval ${sign}${delta}% — facing pushback despite counter-narrative`
        })()

        const approvalReason = (() => {
          const cur = Math.round(tr.interim_approval)
          const prev = Math.round(tr.approval_before ?? tr.interim_approval)
          const delta = cur - prev
          const ward = tr.ward_report ?? []
          const hotspots = ward.filter(w => w.hotspot).map(w => w.group_name)
          const brightSpots = ward.filter(w => w.bright_spot).map(w => w.group_name)
          if (delta > 3 && brightSpots.length > 0)
            return `${brightSpots[0]} and ${brightSpots.length - 1 > 0 ? `${brightSpots.length - 1} other group${brightSpots.length > 2 ? 's' : ''}` : 'others'} responded positively — approval up ${delta}%`
          if (delta > 1) return `Modest approval gain of +${delta}% — delivery is building credibility`
          if (delta < -2 && hotspots.length > 0)
            return `${hotspots[0]} dissatisfied — this turn's trade-offs hit them hardest`
          if (delta < 0) return `Slight approval dip of ${delta}% — some demographics feel the costs`
          return `Approval held steady — no major wins or losses in public perception`
        })()

        // Decay: params not in actualDeltas nor sideEffects are decaying
        const protectedParams = new Set([
          ...Object.keys(tr.actual_deltas ?? {}),
          ...Object.keys(tr.side_effect_deltas ?? {}),
        ])
        const allParams = Object.keys(tr.city_params_before ?? {})
        const decayingParams = allParams.filter(k => !protectedParams.has(k))

        const SectionLabel = ({ num, text }: { num: string; text: string }) => (
          <div className="flex items-center gap-1.5" style={{ marginBottom: 5 }}>
            <span style={{
              fontSize: 8, fontWeight: 700, color: '#e8a030', fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: '0.12em', minWidth: 14, textAlign: 'right',
            }}>{num}</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#4b6280',
              fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {text}
            </span>
          </div>
        )

        const Reason = ({ text }: { text: string }) => (
          <div style={{ fontSize: 9, color: '#4b6280', fontStyle: 'italic', marginTop: 3 }}>{text}</div>
        )

        // Score bar row helper
        const ScoreRow = ({ label, value, max = 1, color, note }: { label: string; value: number; max?: number; color: string; note?: string }) => (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 9, color: '#4b6280', minWidth: 90 }}>{label}</span>
            <MiniBar value={(value / max) * 100} color={color} width={52} />
            <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color, fontWeight: 700, minWidth: 30 }}>
              {value < 1 && max === 1 ? value.toFixed(3) : `${Math.round(value)}%`}
            </span>
            {note && <span style={{ fontSize: 8, color: '#4b6280', fontStyle: 'italic' }}>{note}</span>}
          </div>
        )

        return (
          <div style={{ padding: '8px 12px 12px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ① MINOR ACTION */}
            {tr.minor_action && (() => {
              const ma = tr.minor_action
              const typeLabels: Record<string, string> = {
                governance_upkeep: '⚙ Governance Upkeep',
                banking: '◈ Budget Banking',
                maintenance: '⛏ Sector Maintenance',
                press_conference: '◉ Press Conference',
                emergency_fund: '⚡ Emergency Fund',
                reshuffle: '⟲ Cabinet Reshuffle',
              }
              const typeEffects: Record<string, string> = {
                governance_upkeep: 'admin efficiency, anti-corruption & media freedom each +1.0',
                banking: `+₹20 Cr banked — skipped policy spend this turn`,
                maintenance: ma.target ? `${fmt(ma.target)} protected from decay` : 'sector shielded from decay',
                press_conference: ma.target ? `${ma.target} group alignment boosted` : 'public outreach executed',
                emergency_fund: ma.budget > 0 ? `₹${fmtNum(ma.budget)} Cr emergency allocation` : 'crisis funds deployed',
                reshuffle: 'cabinet restructured — loyalty and portfolios updated',
              }
              const label = typeLabels[ma.type] ?? ma.type.replace(/_/g, ' ')
              const effect = typeEffects[ma.type] ?? ''
              return (
                <div>
                  <SectionLabel num="①" text="Minor Action" />
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 10, color: '#c4a35a', fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 9, color: '#4b6280' }}>→</span>
                    <span style={{ fontSize: 9, color: '#64748b', fontStyle: 'italic' }}>{effect}</span>
                  </div>
                </div>
              )
            })()}

            {/* ② IMPLEMENTATION ENGINE */}
            <div>
              <SectionLabel num="②" text="Implementation" />
              {/* Minister header */}
              {execMinister && (
                <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>{execMinister.name}</span>
                  <span style={{ fontSize: 8, color: '#4b6280' }}>|</span>
                  <span style={{ fontSize: 9, color: '#4b6280' }}>{tr.major_policy?.portfolio}</span>
                  {portfolioCount > 1 && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.3)',
                      color: '#fb923c', fontWeight: 600,
                    }}>{portfolioCount} portfolios</span>
                  )}
                </div>
              )}
              {/* Score breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                {mScoreRaw !== null && (
                  <ScoreRow
                    label="Minister score"
                    value={mScoreRaw}
                    color="#60a5fa"
                    note={mPenalty < 1 ? `×${mPenalty} overload penalty` : undefined}
                  />
                )}
                <ScoreRow label="City capacity" value={cScore} color="#818cf8" />
                <div style={{ height: 1, background: '#1c3652', margin: '2px 0' }} />
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 9, color: '#4b6280', minWidth: 90 }}>Execution</span>
                  <div style={{ flex: 1, height: 5, background: '#0a1a30', borderRadius: 3, overflow: 'hidden', maxWidth: 52 }}>
                    <div style={{ width: `${execPct}%`, height: '100%', background: execColor,
                      borderRadius: 3, boxShadow: `0 0 6px ${execColor}66` }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: execColor, fontWeight: 700, minWidth: 34 }}>
                    {execPct}%
                  </span>
                  {mScoreRaw !== null && (
                    <span style={{ fontSize: 8, color: '#4b6280', fontStyle: 'italic' }}>
                      0.55×M + 0.45×C
                    </span>
                  )}
                </div>
              </div>
              <Reason text={execReason} />
              {/* Delivery targets */}
              {((tr as any).delivery_details ?? tr.delivery_targets ?? []).length > 0 && (
                <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {((tr as any).delivery_details ?? tr.delivery_targets ?? [] as any[]).map((d: any, i: number) => {
                    const ratio = d.completion_ratio ?? 1
                    const col = ratio >= 0.8 ? '#22c55e' : ratio >= 0.5 ? '#e8a030' : '#f87171'
                    return (
                      <div key={i} className="flex items-center justify-between" style={{ fontSize: 9, color: '#64748b' }}>
                        <span>{d.label ?? d.key}</span>
                        <span style={{ color: col, fontFamily: "'Share Tech Mono', monospace", fontWeight: 600 }}>
                          {Math.round(d.delivered ?? 0)}{d.unit ? ` ${d.unit}` : ''} / {Math.round(d.proposed ?? 0)}{d.unit ? ` ${d.unit}` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Side effects */}
              {sideEffectEntries.length > 0 && (
                <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {sideEffectEntries.map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 3,
                      background: v < 0 ? 'rgba(248,113,113,0.10)' : 'rgba(34,197,94,0.10)',
                      color: v < 0 ? '#fca5a5' : '#86efac',
                      border: `1px solid ${v < 0 ? '#7f1d1d44' : '#14532d44'}`,
                    }}>
                      {fmt(k)} {v > 0 ? '+' : ''}{Math.round(v)}
                    </span>
                  ))}
                  <Reason text={paramReason} />
                </div>
              )}
            </div>

            {/* ③ BUDGET */}
            <div>
              <SectionLabel num="③" text="Budget" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
                {[
                  { label: 'Tax Revenue', value: `+₹${fmtNum(tr.tax_revenue ?? 0)} Cr`, color: '#4ade80' },
                  { label: 'Policy Cost', value: `-₹${fmtNum(tr.major_policy?.budget_cost ?? 0)} Cr`, color: '#f87171' },
                  tr.interest_paid > 0 ? { label: 'Interest', value: `-₹${fmtNum(tr.interest_paid)} Cr`, color: '#fb923c' } : null,
                  tr.budget_stolen > 0 ? { label: 'Leaked', value: `-₹${fmtNum(tr.budget_stolen)} Cr`, color: '#fb923c' } : null,
                  { label: 'Treasury', value: `₹${fmtNum(tr.treasury_after ?? 0)} Cr`, color: '#f0c040' },
                  {
                    label: 'Net this turn',
                    value: netTreasury >= 0 ? `+₹${fmtNum(netTreasury)} Cr` : `-₹${fmtNum(Math.abs(netTreasury))} Cr`,
                    color: netTreasury >= 0 ? '#4ade80' : '#f87171',
                  },
                ].filter(Boolean).map((row, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span style={{ fontSize: 9, color: '#4b6280' }}>{row!.label}</span>
                    <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: row!.color, fontWeight: 600 }}>{row!.value}</span>
                  </div>
                ))}
              </div>
              {/* Time profile split */}
              {tr.major_policy?.time_profile && Object.keys(tr.major_policy.time_profile).length > 1 && (() => {
                const cost = tr.major_policy.budget_cost ?? 0
                const entries = Object.entries(tr.major_policy.time_profile)
                return (
                  <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {entries.map(([turn, frac]) => {
                      const turnNum = parseInt(turn.replace('turn_', ''))
                      const amt = Math.round(cost * frac)
                      const isNow = turnNum === 0
                      return (
                        <span key={turn} style={{
                          fontSize: 8, padding: '1px 6px', borderRadius: 3,
                          background: isNow ? 'rgba(240,192,64,0.08)' : 'rgba(75,98,128,0.12)',
                          color: isNow ? '#f0c040' : '#4b6280',
                          border: `1px solid ${isNow ? 'rgba(240,192,64,0.25)' : 'rgba(75,98,128,0.3)'}`,
                        }}>
                          {isNow ? 'Now' : `+${turnNum}t`} · {Math.round(frac * 100)}% · ₹{fmtNum(amt)} Cr
                        </span>
                      )
                    })}
                  </div>
                )
              })()}
              <Reason text={budgetReason} />
            </div>

            {/* ④ PARAMETER CHANGES + DECAY */}
            {(paramDeltas.length > 0 || decayingParams.length > 0) && (
              <div>
                <SectionLabel num="④" text="City Parameters" />
                {/* Policy effects */}
                {paramDeltas.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
                    {paramDeltas.map(d => (
                      <span key={d.key} style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: d.diff > 0 ? 'rgba(34,197,94,0.10)' : 'rgba(248,113,113,0.10)',
                        color: d.diff > 0 ? '#86efac' : '#fca5a5',
                        border: `1px solid ${d.diff > 0 ? '#14532d44' : '#7f1d1d44'}`,
                      }}>
                        {fmt(d.key)} {d.diff > 0 ? '+' : ''}{d.diff}
                      </span>
                    ))}
                  </div>
                )}
                {/* Decay */}
                {decayingParams.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, color: '#4b6280', marginBottom: 3 }}>
                      <span style={{ color: '#f87171' }}>{decayingParams.length} decaying</span>
                      {protectedParams.size > 0 && (
                        <span style={{ color: '#22c55e', marginLeft: 6 }}>{protectedParams.size} protected</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {decayingParams.slice(0, 8).map(k => (
                        <span key={k} style={{
                          fontSize: 8, padding: '1px 5px', borderRadius: 3,
                          background: 'rgba(248,113,113,0.06)', color: '#94a3b8',
                          border: '1px solid rgba(248,113,113,0.15)',
                        }}>
                          {fmt(k)}
                        </span>
                      ))}
                      {decayingParams.length > 8 && (
                        <span style={{ fontSize: 8, color: '#4b6280' }}>+{decayingParams.length - 8} more</span>
                      )}
                    </div>
                  </div>
                )}
                <Reason text={paramReason} />
              </div>
            )}

            {/* ⑤ EVENTS */}
            {tr.events_triggered?.length > 0 && (
              <div>
                <SectionLabel num="⑤" text="Events" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {tr.events_triggered.map(ev => {
                    const isCrisis = ev.type === 'crisis'
                    const portfolioParamMap: Record<string, string> = {
                      'Infrastructure': 'transit and roads', 'Health & Education': 'hospitals and clinics',
                      'Environment': 'air quality and pollution', 'Home Affairs': 'police and emergency',
                      'Finance & Economy': 'jobs and commerce', 'Housing & Community': 'affordable housing',
                      'Governance Reform': 'admin efficiency',
                    }
                    const paramHint = portfolioParamMap[ev.portfolio ?? ''] ?? ev.portfolio ?? 'city conditions'
                    const paramVal = ev.portfolio && p
                      ? Math.round((p as Record<string, number>)[paramHint.replace(/ /g, '_')] ?? 0) : null
                    const sevDots = Array.from({ length: ev.severity ?? 1 }).map((_, i) => (
                      <span key={i} style={{ fontSize: 7, color: isCrisis ? '#f87171' : '#4ade80' }}>●</span>
                    ))
                    return (
                      <div key={ev.id} style={{
                        padding: '4px 8px', borderRadius: 4,
                        background: isCrisis ? 'rgba(248,113,113,0.07)' : 'rgba(34,197,94,0.07)',
                        border: `1px solid ${isCrisis ? '#7f1d1d44' : '#14532d44'}`,
                      }}>
                        <div className="flex items-center gap-1.5">
                          <div style={{ fontSize: 10, fontWeight: 700, color: isCrisis ? '#fca5a5' : '#86efac' }}>
                            {isCrisis ? '⚠' : '✦'} {ev.name}
                          </div>
                          <div className="flex items-center gap-0.5">{sevDots}</div>
                          <span style={{ fontSize: 8, color: '#4b6280', marginLeft: 2 }}>sev {ev.severity}</span>
                        </div>
                        <div style={{ fontSize: 9, color: '#4b6280', marginTop: 1, fontStyle: 'italic' }}>
                          {isCrisis
                            ? `${ev.portfolio ?? 'sector'} was vulnerable${paramVal !== null && paramVal > 0 ? ` — ${paramHint} at ${paramVal}` : ''} when this crisis hit`
                            : `strong city performance in ${ev.portfolio ?? 'this sector'} attracted this opportunity${paramVal !== null && paramVal > 0 ? ` — ${paramHint} at ${paramVal}` : ''}`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ⑥ OPPOSITION */}
            {tr.opposition_attack && (
              <div>
                <SectionLabel num="⑥" text="Opposition" />
                <div className="flex items-start gap-2">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: '#4b6280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Attack</div>
                    <div style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>{tr.opposition_attack}</div>
                    <Reason text={attackDetail} />
                  </div>
                  {tr.counter_frame && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: '#4b6280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Counter</div>
                      <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>{tr.counter_frame}</div>
                      <Reason text={counterDetail} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ⑦ CITY PULSE */}
            <div>
              <SectionLabel num="⑦" text="City Pulse" />
              {(() => {
                const approvalBefore = Math.round(tr.approval_before ?? tr.interim_approval)
                const approvalAfter = Math.round(tr.interim_approval)

                const tensionBefore = tr.city_params_before
                  ? Math.round((tr.city_params_before as Record<string, number>).communal_tension ?? tr.communal_tension_after ?? 0)
                  : Math.round(tr.communal_tension_after ?? 0)
                const tensionAfter = Math.round(tr.communal_tension_after ?? 0)
                const tensionDelta = tensionAfter - tensionBefore

                // Loyalty changes as proxy for scandal
                const loyaltyChanges = Object.entries(tr.minister_loyalty_changes ?? {})
                const bigDrops = loyaltyChanges.filter(([,d]) => d < -5)

                const PulseRow = ({ label, before, after, unit = '', higherGood = true }: {
                  label: string; before: number; after: number; unit?: string; higherGood?: boolean
                }) => {
                  const delta = after - before
                  const isGood = higherGood ? delta >= 0 : delta <= 0
                  const isNeutral = Math.abs(delta) < 0.5
                  const deltaColor = isNeutral ? '#4b6280' : isGood ? '#22c55e' : '#f87171'
                  const arrow = isNeutral ? '─' : delta > 0 ? '↑' : '↓'
                  return (
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <span style={{ fontSize: 9, color: '#4b6280', minWidth: 72 }}>{label}</span>
                      <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: '#64748b' }}>{before.toFixed(before < 10 ? 1 : 0)}{unit}</span>
                      <span style={{ fontSize: 8, color: '#4b6280' }}>→</span>
                      <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#cbd5e1', fontWeight: 700 }}>{after.toFixed(after < 10 ? 1 : 0)}{unit}</span>
                      <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: deltaColor, fontWeight: 600, minWidth: 32 }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(Math.abs(delta) < 2 ? 1 : 0)}{unit}
                      </span>
                      <span style={{ fontSize: 10, color: deltaColor }}>{arrow}</span>
                    </div>
                  )
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <PulseRow label="Approval" before={approvalBefore} after={approvalAfter} unit="%" />
                    <PulseRow label="Tension" before={tensionBefore} after={tensionAfter} higherGood={false} />
                    {bigDrops.length > 0 && (
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <span style={{ fontSize: 9, color: '#f87171', minWidth: 72 }}>Scandal risk</span>
                        <span style={{ fontSize: 9, color: '#4b6280', fontStyle: 'italic' }}>
                          {bigDrops.map(([id]) => ministers.find(m => m.id === id)?.name ?? id.slice(0, 8)).join(', ')} loyalty dropped sharply
                        </span>
                      </div>
                    )}
                    <Reason text={approvalReason} />
                    {tensionDelta !== 0 && (
                      <Reason text={tensionDelta > 0
                        ? `Communal tension rose — ${tr.opposition_attack?.toLowerCase().includes('identity') ? 'opposition mobilized divisions' : 'community spaces impact'}`
                        : `Tension eased — community stability holding`}
                      />
                    )}
                  </div>
                )
              })()}
            </div>

            {/* ⑧ NARRATIVE */}
            {tr.delivery_narrative && (() => {
              const bullets = tr.delivery_narrative
                .split(/(?<=\.)\s+/)
                .map(s => s.trim().replace(/\.$/, ''))
                .filter(s => s.length > 12)
                .slice(0, 3)
              return (
                <div>
                  <SectionLabel num="⑧" text="Narrative" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {bullets.map((b, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span style={{ fontSize: 8, color: '#e8a030', marginTop: 1 }}>•</span>
                        <span style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5, fontStyle: 'italic' }}>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* ADVISOR */}
            {tr.advisor_summary && (() => {
              const line = tr.advisor_summary
                .split(/(?<=\.)\s+/)
                .filter(s => s.length > 10)
                .slice(0, 1)[0] ?? tr.advisor_summary
              return (
                <div style={{
                  padding: '6px 10px', borderRadius: 5,
                  background: 'rgba(232,160,48,0.06)', border: '1px solid rgba(232,160,48,0.20)',
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#e8a030',
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', marginTop: 1, whiteSpace: 'nowrap' }}>
                    ADVISOR
                  </div>
                  <div style={{ fontSize: 10, color: '#b8924a', lineHeight: 1.5, fontStyle: 'italic' }}>
                    {line}
                  </div>
                </div>
              )
            })()}

          </div>
        )
      })()}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GameDashboard({ gameId, initialState }: { gameId: string; initialState: GameState }) {
  const [gameState, setGameState] = useState<GameState>(initialState)
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(initialState.last_turn)
  const [turnHistory, setTurnHistory] = useState<TurnEntry[]>([])
  const initialTreasury = useRef(initialState.treasury)

  // Unified council chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [consultLoading, setConsultLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  // Track who is open in backend (one at a time)
  const activeConsultRef = useRef<string | null>(null)

  // Minister expand
  const [expandedMinisterId, setExpandedMinisterId] = useState<string | null>(null)

  // All parameters panel
  const [showAllParams, setShowAllParams] = useState(false)

  // Minor Action


  // Policy modal
  const [policyOptions, setPolicyOptions] = useState<Policy[] | null>(null)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [fetchingPolicies, setFetchingPolicies] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)

  // Turn execution
  const [isTurnExecuting, setIsTurnExecuting] = useState(false)
  const [executingPolicyName, setExecutingPolicyName] = useState<string | null>(null)
  const [turnError, setTurnError] = useState<string | null>(null)

  // Game over
  const [gameOver, setGameOver] = useState(false)
  const [scorecard, setScorecard] = useState<GovernanceScorecard | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  // ── Consultation helpers ─────────────────────────────────────────────────

  // Send message through one minister's consultation, get reply.
  // Builds context from all prior chat messages so the minister sees the full room discussion.
  async function getMinisterReply(m: Minister, mayorMsg: string): Promise<string> {
    // Close any different minister that's currently open
    if (activeConsultRef.current && activeConsultRef.current !== m.id) {
      await closeConsultation(gameId).catch(() => { })
      activeConsultRef.current = null
    }
    // Open this minister's consultation if not already open
    if (activeConsultRef.current !== m.id) {
      await openConsultation(gameId, m.id)
      activeConsultRef.current = m.id
    }
    // Build context message: include recent other ministers' replies so they sound like a real room
    const recentContext = chatMessages.slice(-6)
      .filter(msg => !msg.isMayor)
      .map(msg => `${msg.sender} (${msg.senderRole}): ${msg.text}`)
      .join('\n')
    const fullMsg = recentContext
      ? `[Council room context — other ministers said:\n${recentContext}]\n\nMayor: ${mayorMsg}`
      : mayorMsg
    const res = await messageMinister(gameId, fullMsg)
    return res.reply
  }

  // ── Main send handler ────────────────────────────────────────────────────

  async function handleSendMessage() {
    if (!chatInput.trim() || consultLoading) return

    const msg = chatInput.trim()
    setChatInput('')
    setChatError(null)
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Add mayor's message
    setChatMessages(prev => [...prev, {
      isMayor: true, sender: 'Mayor', senderRole: '', text: msg,
      time: now, ringColor: '#d97706', seed: 'mayor',
    }])
    setConsultLoading(true)

    try {
      const ministers = gameState.ministers
      // Detect @mention or name references
      const mentioned = detectMentioned(msg, ministers)
      // If specific minister(s) mentioned, only they reply. Otherwise pick 2 naturally.
      const responderIndices = mentioned.length > 0
        ? [...new Set(mentioned)].slice(0, 3)
        : pickResponders(ministers)

      for (const idx of responderIndices) {
        const m = ministers[idx]
        const mColor = MINISTER_COLORS[idx % MINISTER_COLORS.length]
        try {
          const reply = await getMinisterReply(m, msg)
          const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: m.name, senderRole: m.portfolio,
            text: reply, time: replyTime,
            ringColor: mColor, seed: m.name,
          }])
        } catch (e) {
          console.error(`Reply from ${m.name} failed:`, e)
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setChatError(`Chat failed: ${errMsg}`)
    } finally {
      setConsultLoading(false)
    }
  }

  // ── Draft Policy → close consult → get policies ──────────────────────────

  async function handleDraftPolicy() {
    if (fetchingPolicies) return
    setFetchingPolicies(true)
    setPolicyError(null)
    try {
      // Close any open consultation so the transcript is sealed
      if (activeConsultRef.current) {
        await closeConsultation(gameId).catch(() => { })
        activeConsultRef.current = null
      }
      const res = await getPolicies(gameId)
      setPolicyOptions(res.options)
      setShowPolicyModal(true)
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setPolicyError(`Failed to load policies: ${errMsg}`)
    } finally {
      setFetchingPolicies(false)
    }
  }

  // ── Next Turn (shortcut to Draft Policy) ─────────────────────────────────

  async function handleNextTurn() {
    if (showPolicyModal || isTurnExecuting || fetchingPolicies) return
    await handleDraftPolicy()
  }

  // ── Execute Turn ─────────────────────────────────────────────────────────

  async function handleSelectPolicy(index: number) {
    if (isTurnExecuting) return
    setIsTurnExecuting(true)
    setTurnError(null)

    const selectedPolicy = policyOptions?.[index]
    setExecutingPolicyName(selectedPolicy?.name || 'Policy Execution')
    setShowPolicyModal(false)

    try {
      const res = await executeTurn(gameId, index, { type: 'governance_upkeep', budget: 0 }, 'Delivery Receipts')
      const tr = res.turn_result
      const newState = res.state

      setGameState(newState)
      setLastTurn(tr)

      // Add turn to history — latest expanded, collapse all previous
      const newEntry: TurnEntry = { turn: tr.turn, result: tr, expanded: true }
      setTurnHistory(prev => [newEntry, ...prev.map(e => ({ ...e, expanded: false }))])
      setShowPolicyModal(false)
      setPolicyOptions(null)
      setExecutingPolicyName(null)
      setPolicyError(null)

      // Reset chat for next turn
      setChatMessages([])
      activeConsultRef.current = null

      if (res.game_over) {
        setGameOver(true)
        if (res.scorecard) setScorecard(res.scorecard)
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setTurnError(`Turn execution failed: ${errMsg}`)
    } finally {
      setIsTurnExecuting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const cp = gameState.city_params
  const wf = deriveWelfare(cp)
  const wd = lastTurn?.city_params_after && lastTurn?.city_params_before
    ? welfareDelta(lastTurn.city_params_after, lastTurn.city_params_before)
    : { health: 0, wealth: 0, safety: 0, social: 0 }

  const welfareStats: WelfareStat[] = [
    {
      label: 'Health', score: wf.health, delta: wd.health,
      stroke: '#22c55e', glow: '#16a34a', trackColor: '#0a2010',
      gradientId: 'healthG', gradientFrom: '#22c55e', gradientTo: '#86efac',
      symbol: '♥', bg: 'rgba(34,197,94,0.08)'
    },
    {
      label: 'Wealth', score: wf.wealth, delta: wd.wealth,
      stroke: '#38bdf8', glow: '#0284c7', trackColor: '#071a28',
      gradientId: 'wealthG', gradientFrom: '#38bdf8', gradientTo: '#7dd3fc',
      symbol: '◈', bg: 'rgba(56,189,248,0.08)'
    },
    {
      label: 'Safety', score: wf.safety, delta: wd.safety,
      stroke: '#f59e0b', glow: '#d97706', trackColor: '#1a1000',
      gradientId: 'safetyG', gradientFrom: '#f59e0b', gradientTo: '#fcd34d',
      symbol: '⬡', bg: 'rgba(245,158,11,0.08)'
    },
    {
      label: 'Society', score: wf.social, delta: wd.social,
      stroke: '#f87171', glow: '#dc2626', trackColor: '#200a0a',
      gradientId: 'socialG', gradientFrom: '#f87171', gradientTo: '#fca5a5',
      symbol: '✦', bg: 'rgba(248,113,113,0.08)'
    },
  ]

  const treasury = gameState.treasury
  const initTreasury = initialTreasury.current
  const spent = Math.max(0, initTreasury - treasury)
  const spentPct = initTreasury > 0 ? Math.min(100, (spent / initTreasury) * 100) : 0

  const approval = gameState.interim_approval
  const prevApproval = lastTurn ? (lastTurn.interim_approval - (lastTurn.actual_deltas?.['interim_approval'] ?? 0)) : approval
  const approvalDelta = approval - prevApproval
  const approvalCirc = 2 * Math.PI * 16
  const approvalFill = (Math.max(0, Math.min(100, approval)) / 100) * approvalCirc

  const crises = gameState.active_events.filter(e => e.type === 'crisis')
  const opportunities = gameState.active_events.filter(e => e.type === 'opportunity')
  const allCrises: ActiveEvent[] = [...crises, ...opportunities]

  const streamImg = lastTurn?.major_policy
    ? (PORTFOLIO_IMG[lastTurn.major_policy.portfolio] ?? DEFAULT_IMG)
    : DEFAULT_IMG
  const streamTitle = lastTurn?.major_policy?.name ?? (crises[0]?.name ?? 'City Overview')
  const streamLocation = lastTurn?.major_policy?.portfolio ?? crises[0]?.portfolio ?? ''

  const streamEffects = lastTurn?.actual_deltas
    ? Object.entries(lastTurn.actual_deltas)
      .filter(([, v]) => Math.abs(v as number) >= 1)
      .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))
      .slice(0, 3)
      .map(([k, v]) => ({
        label: `${k.replace(/_/g, ' ')} ${(v as number) >= 0 ? '+' : ''}${Math.round(v as number)}`,
        color: (v as number) >= 0 ? '#22c55e' : '#f87171',
        up: (v as number) >= 0,
      }))
    : []

  const wardReport: WardReportEntry[] = lastTurn?.ward_report ?? []
  const mediaHeadlines: MediaHeadline[] = lastTurn?.media_headlines ?? []
  const citizenVoices: CitizenVoice[] = lastTurn?.citizen_voices ?? []

  const leanColor = (lean: string) =>
    lean === 'mayor' ? '#22c55e' : lean === 'opposition' ? '#f87171' : '#60a5fa'
  const leanBg = (lean: string) =>
    lean === 'mayor' ? '#991b1b' : lean === 'opposition' ? '#1e40af' : '#065f46'
  const sentimentRing = (s: string) =>
    s === 'approve' ? '#22c55e' : s === 'disapprove' ? '#f87171' : '#e8a030'

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col overflow-hidden"
      style={{ background: '#050d1b', color: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* Modals */}
      {gameOver && scorecard && <ScorecardOverlay sc={scorecard} />}
      {showPolicyModal && policyOptions && (
        <PolicyModal
          options={policyOptions}
          onSelect={handleSelectPolicy}
          onClose={() => { if (!isTurnExecuting) { setShowPolicyModal(false); setPolicyOptions(null); setPolicyError(null) } }}
          loading={isTurnExecuting}
          error={turnError}
        />
      )}

      {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 shrink-0"
        style={{
          height: 52, background: 'linear-gradient(90deg, #071320 0%, #0a1828 40%, #071320 100%)',
          borderBottom: '1px solid #1c3652', boxShadow: '0 2px 20px rgba(0,0,0,0.5)', zIndex: 10
        }}>

        {/* Emblem + City */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center rounded-full shrink-0" style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #92400e 100%)',
            boxShadow: '0 0 12px rgba(217,119,6,0.5), inset 0 1px 1px rgba(255,255,255,0.2)',
            border: '1.5px solid #f59e0b', fontSize: 16,
          }}>🏛</div>
          <div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15,
              color: '#f0c040', letterSpacing: '0.06em', textShadow: '0 0 12px rgba(240,192,64,0.5)'
            }}>
              City of {gameState.city_name}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0 rounded" style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                letterSpacing: '0.1em', color: '#e8a030',
                background: 'rgba(232,160,48,0.12)', border: '1px solid rgba(232,160,48,0.25)',
              }}>TERM 1</span>
              <ChevronRight size={9} color="#4b6280" />
              <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#4b6280' }}>
                Turn {gameState.current_turn} / {gameState.total_turns}
              </span>
            </div>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Budget */}
        <div className="flex-1 max-w-md">
          <div className="flex items-center justify-between mb-1">
            <span style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              letterSpacing: '0.2em', color: '#4b6280'
            }}>BUDGET</span>
            <span style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              letterSpacing: '0.12em', color: '#4b6280'
            }}>FISCAL YEAR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: 12, fontWeight: 700, ...MONO('#f87171') }}>
                ₹{fmtNum(spent)} Cr
              </span>
              <span style={{ fontSize: 9, color: '#64748b' }}>Spent</span>
            </div>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#071018' }}>
              <div className="h-full rounded-full" style={{
                width: `${spentPct}%`,
                background: 'linear-gradient(90deg, #dc2626, #f59e0b)',
                boxShadow: '0 0 6px rgba(245,158,11,0.5)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: 9, color: '#64748b' }}>Left</span>
              <span style={{ fontSize: 12, fontWeight: 700, ...MONO('#4ade80') }}>
                ₹{fmtNum(Math.max(0, treasury))} Cr
              </span>
            </div>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Mayor Approval */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex items-center justify-center rounded-full" style={{ width: 38, height: 38 }}>
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle cx="19" cy="19" r="16" fill="none" stroke="#0a1a30" strokeWidth="4" />
              <circle cx="19" cy="19" r="16" fill="none" stroke="#22c55e" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${approvalFill} ${approvalCirc}`}
                transform="rotate(-90 19 19)"
                style={{ filter: 'drop-shadow(0 0 4px #16a34a)' }} />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 700, ...MONO('#4ade80'), position: 'relative', zIndex: 1 }}>
              {Math.round(approval)}%
            </span>
          </div>
          <div>
            <div style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
              color: '#4b6280', fontWeight: 700
            }}>MAYOR APPROVAL</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span style={{ fontSize: 18, fontWeight: 700, ...MONO('#f0c040'), lineHeight: 1 }}>
                {Math.round(approval)}%
              </span>
              {approvalDelta !== 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: approvalDelta >= 0 ? '#4ade80' : '#f87171'
                }}>
                  {approvalDelta >= 0 ? '▲' : '▼'} {approvalDelta >= 0 ? '+' : ''}{Math.round(approvalDelta)}%
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Controls */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {[{ Icon: Clock, label: 'History' }, { Icon: HelpCircle, label: 'Help' }, { Icon: Settings, label: 'Settings' }]
            .map(({ Icon, label }) => (
              <button key={label} title={label}
                className="flex items-center justify-center rounded transition-all"
                style={{
                  width: 30, height: 30, background: 'rgba(255,255,255,0.04)', border: '1px solid #1c3652',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a030'; e.currentTarget.style.background = 'rgba(232,160,48,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1c3652'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}>
                <Icon size={13} color="#4b6280" />
              </button>
            ))}

          <button
            onClick={handleNextTurn}
            disabled={isTurnExecuting || fetchingPolicies || showPolicyModal}
            className="flex items-center gap-2 rounded font-bold transition-all"
            style={{
              background: (isTurnExecuting || fetchingPolicies || showPolicyModal)
                ? '#2a3a4a'
                : 'linear-gradient(135deg, #c47d10, #e8a030, #c47d10)',
              padding: '7px 14px', fontSize: 12,
              color: (isTurnExecuting || fetchingPolicies || showPolicyModal) ? '#4b6280' : '#040d1b',
              fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em', fontWeight: 700,
              boxShadow: '0 0 16px rgba(232,160,48,0.4), inset 0 1px 1px rgba(255,255,255,0.3)',
              border: '1px solid rgba(255,200,60,0.4)',
              cursor: (isTurnExecuting || fetchingPolicies || showPolicyModal) ? 'not-allowed' : 'pointer',
            }}>
            {(isTurnExecuting || fetchingPolicies)
              ? <><Loader2 size={13} className="animate-spin" /> LOADING...</>
              : <><SkipForward size={13} /> NEXT TURN</>}
          </button>
        </div>
      </div>

      {/* Policy error bar (outside modal, e.g. if modal closed before error) */}
      {policyError && !showPolicyModal && (
        <div style={{
          background: 'rgba(248,113,113,0.1)', borderBottom: '1px solid #7f1d1d',
          padding: '6px 16px', fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertTriangle size={13} />
          {policyError}
          <button onClick={() => setPolicyError(null)} style={{
            marginLeft: 'auto', background: 'none',
            border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14
          }}>✕</button>
        </div>
      )}

      {/* ── MAIN 3-COLUMN ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">

        {/* ── LEFT: Advisory Chat + Crises ───────────────────────────────── */}
        <div className="w-[300px] flex flex-col gap-2 shrink-0">

          {/* Advisory Chat Panel */}
          <div className="flex flex-col flex-1 overflow-hidden" style={PANEL}>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid #1c3652', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-2">
                <Zap size={12} color="#e8a030" />
                <span style={HDR_LABEL}>SC ADVISORY CHAT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #22c55e' }} />
                <span className="text-green-400" style={{ fontSize: 10 }}>Online</span>
              </div>
            </div>

            {/* Minister List */}
            <div style={{ borderBottom: '1px solid #1c3652', position: 'relative' }}>
              {gameState.ministers.map((m, idx) => {
                const col = MINISTER_COLORS[idx % MINISTER_COLORS.length]
                const isExpanded = expandedMinisterId === m.id
                return (
                  <div key={m.id}>
                    <div
                      onClick={() => setExpandedMinisterId(isExpanded ? null : m.id)}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                      style={{
                        borderBottom: isExpanded ? 'none' : '1px solid rgba(28,54,82,0.5)',
                        background: isExpanded ? 'rgba(255,255,255,0.04)' : '',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '' }}
                    >
                      <div className="shrink-0">
                        {isExpanded
                          ? <ChevronDown size={10} color="#4b6280" />
                          : <ChevronRight size={10} color="#4b6280" />}
                      </div>
                      <div className="shrink-0 relative" style={{ width: 34, height: 34 }}>
                        <Avatar seed={m.name} size={28} ring={col} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 600 }}>{m.name}</div>
                        <div className="text-gray-500 truncate" style={{ fontSize: 10 }}>{m.portfolio}</div>
                      </div>
                      <div className="shrink-0 flex flex-col items-center gap-0.5">
                        <LoyaltyArc value={m.loyalty} color={col} />
                        <span style={{ fontSize: 9, letterSpacing: '0.05em', color: '#4b6280' }}>LOYALTY</span>
                      </div>
                    </div>
                    {/* Expanded inline detail */}
                    {isExpanded && (
                      <div style={{
                        borderLeft: `2px solid ${col}`,
                        borderBottom: '1px solid rgba(28,54,82,0.5)',
                        background: 'rgba(255,255,255,0.02)',
                        padding: '8px 10px 10px 12px',
                      }}>
                        {/* Stat bars */}
                        {[
                          { label: 'Loyalty', value: m.loyalty, color: '#22c55e' },
                          { label: 'Political Capital', value: m.political_capital ?? 50, color: '#38bdf8' },
                          { label: 'Scandal Exposure', value: m.scandal_exposure, color: m.scandal_exposure > 50 ? '#f87171' : '#64748b' },
                        ].map(s => (
                          <div key={s.label} className="flex items-center gap-2 mb-1.5">
                            <span style={{ fontSize: 9, color: '#64748b', width: 80, fontFamily: "'Rajdhani', sans-serif",
                              letterSpacing: '0.06em', fontWeight: 600 }}>{s.label.toUpperCase()}</span>
                            <div style={{ flex: 1, height: 3, background: '#071018', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, s.value))}%`,
                                background: s.color, borderRadius: 2, boxShadow: `0 0 4px ${s.color}80` }} />
                            </div>
                            <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: s.color, width: 20, textAlign: 'right' }}>
                              {Math.round(s.value)}
                            </span>
                          </div>
                        ))}

                        {/* Capability & Alignment */}
                        <div className="flex gap-4 mt-2 mb-2">
                          {m.capability?.competence != null && (
                            <div className="flex items-center gap-1.5">
                              <span style={{ fontSize: 9, color: '#64748b' }}>Competence</span>
                              <span style={{ fontSize: 10, ...MONO('#38bdf8'), fontWeight: 700 }}>{Math.round(m.capability.competence)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 9, color: '#64748b' }}>Alignment</span>
                            <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700,
                              color: m.mayor_alignment > 20 ? '#22c55e' : m.mayor_alignment < -20 ? '#f87171' : '#94a3b8' }}>
                              {m.mayor_alignment > 0 ? '+' : ''}{Math.round(m.mayor_alignment)}
                            </span>
                          </div>
                        </div>

                        {/* Demographics summary */}
                        {m.demographics && (
                          <div style={{ fontSize: 9, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
                            {[m.demographics.profession, m.demographics.age_group, m.demographics.location, m.demographics.income_bracket]
                              .filter(Boolean).join(' · ')}
                          </div>
                        )}

                        {/* Personality traits */}
                        {m.personality && Object.keys(m.personality).length > 0 && (
                          <div className="flex gap-1.5 flex-wrap mb-1.5">
                            {Object.entries(m.personality).map(([trait, val]) => {
                              const v = Math.round(val)
                              const c = v > 65 ? '#38bdf8' : v < 35 ? '#f59e0b' : '#64748b'
                              return (
                                <span key={trait} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3,
                                  background: `${c}14`, border: `1px solid ${c}33`, color: c,
                                  fontFamily: "'Share Tech Mono', monospace" }}>
                                  {trait.replace(/_/g, ' ')} {v}
                                </span>
                              )
                            })}
                          </div>
                        )}

                        {/* Extra portfolios */}
                        {m.extra_portfolios?.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span style={{ fontSize: 9, color: '#64748b' }}>Also:</span>
                            {m.extra_portfolios.map(p => (
                              <span key={p} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3,
                                background: 'rgba(232,160,48,0.08)', border: '1px solid rgba(232,160,48,0.25)',
                                color: '#e8a030', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Council hint */}
            <div style={{
              padding: '5px 12px', fontSize: 10, color: '#475569',
              background: 'rgba(232,160,48,0.03)', borderBottom: '1px solid rgba(28,54,82,0.4)',
              fontStyle: 'italic', lineHeight: 1.4 }}>
              Click a minister for full stats. Use @name to address someone directly.
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2.5 min-h-0">
              {chatMessages.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', paddingTop: 16 }}>
                  Type a message to consult the council
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div className="shrink-0 mt-0.5" style={{ width: 26, height: 26 }}>
                    {msg.isMayor ? (
                      <div className="rounded-full flex items-center justify-center text-white"
                        style={{
                          width: 26, height: 26,
                          background: `linear-gradient(135deg, ${msg.ringColor}, ${msg.ringColor}88)`,
                          fontSize: 9, fontWeight: 700, border: `1.5px solid ${msg.ringColor}`
                        }}>M</div>
                    ) : (
                      <Avatar seed={msg.seed} size={26} ring={msg.ringColor} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 10, fontWeight: 700, color: msg.isMayor ? '#e8a030' : '#7dd3fc' }}>
                        {msg.sender}
                      </span>
                      {msg.senderRole && <span style={{ fontSize: 10, color: '#475569' }}>· {msg.senderRole}</span>}
                      <span style={{ fontSize: 9, color: '#334155', marginLeft: 'auto' }}>{msg.time}</span>
                    </div>
                    <div className="mt-1 px-2 py-1.5 rounded-lg" style={{
                      fontSize: 11, color: '#c0cfe0',
                      background: msg.isMayor ? 'rgba(216,160,48,0.1)' : 'rgba(255,255,255,0.05)',
                      borderLeft: `2px solid ${msg.ringColor}44`, lineHeight: 1.5,
                    }}>{msg.text}</div>
                  </div>
                </div>
              ))}
              {consultLoading && (
                <div className="flex gap-2 items-center">
                  <Loader2 size={14} color="#4b6280" className="animate-spin" />
                  <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                    Ministers are responding...
                  </div>
                </div>
              )}
              {chatError && (
                <div style={{
                  fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', background: 'rgba(248,113,113,0.08)', border: '1px solid #7f1d1d',
                  borderRadius: 4
                }}>
                  <AlertTriangle size={11} />
                  {chatError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-2 py-2 flex gap-1.5" style={{ borderTop: '1px solid #1c3652' }}>
              <input
                type="text" value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !consultLoading && chatInput.trim() && handleSendMessage()}
                placeholder="Message the council... (@name to address directly)"
                disabled={consultLoading}
                className="flex-1 text-white placeholder-gray-600 focus:outline-none"
                style={{
                  background: '#071018', border: '1px solid #1c3652', borderRadius: 4,
                  padding: '5px 8px', fontSize: 11
                }}
                onFocus={e => (e.target.style.borderColor = '#e8a030')}
                onBlur={e => (e.target.style.borderColor = '#1c3652')}
              />
              <button onClick={handleSendMessage}
                disabled={!chatInput.trim() || consultLoading}
                className="shrink-0 flex items-center justify-center transition-all"
                style={{
                  background: 'linear-gradient(135deg, #c47d10, #e8a030)', borderRadius: 4,
                  width: 30, height: 30, boxShadow: '0 0 8px rgba(232,160,48,0.4)',
                  opacity: (!chatInput.trim() || consultLoading) ? 0.4 : 1,
                  cursor: (!chatInput.trim() || consultLoading) ? 'not-allowed' : 'pointer',
                  border: 'none'
                }}>
                {consultLoading ? <Loader2 size={13} color="white" className="animate-spin" /> : <Send size={13} color="white" />}
              </button>
              <button onClick={handleDraftPolicy} disabled={fetchingPolicies}
                className="shrink-0 text-xs px-2 transition-all"
                style={{
                  background: 'rgba(59,130,246,0.15)', border: '1px solid #1e40af', borderRadius: 4,
                  color: '#60a5fa', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  fontFamily: "'Rajdhani', sans-serif",
                  opacity: fetchingPolicies ? 0.5 : 1, cursor: fetchingPolicies ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={e => { if (!fetchingPolicies) e.currentTarget.style.background = 'rgba(59,130,246,0.25)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}>
                {fetchingPolicies ? <Loader2 size={10} className="animate-spin" /> : 'Draft Policy'}
              </button>
            </div>
          </div>

          {/* Active Crises */}
          <div className="shrink-0" style={PANEL}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={11} color="#e8a030" />
                <span style={HDR_LABEL}>ACTIVE CRISES</span>
              </div>
              <ChevronRight size={14} color="#4b6280" />
            </div>
            <div className="p-2 space-y-1.5">
              {allCrises.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>No active crises</div>
              )}
              {allCrises.slice(0, 3).map((crisis) => {
                const sv = severityLabel(crisis.severity)
                const CrisisIcon = crisis.type === 'crisis' ? (crisis.severity >= 60 ? AlertTriangle : TrendingDown) : Droplets
                return (
                  <div key={crisis.id}
                    className="flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(28,54,82,0.6)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                    <CrisisIcon size={14} color={sv.color} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 600 }}>{crisis.name}</div>
                      {crisis.portfolio && <div style={{ fontSize: 10, color: '#64748b' }}>{crisis.portfolio}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded" style={{
                        fontSize: 9, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.08em', color: sv.color, background: sv.bg, border: `1px solid ${sv.border}`,
                      }}>{sv.label}</span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>{crisis.turns_remaining}T</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER: Welfare + Game Stream ──────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">

          {/* Welfare Indicators */}
          <div style={PANEL} className="shrink-0">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-amber-400" style={{ boxShadow: '0 0 6px #f59e0b' }} />
                <span style={HDR_LABEL}>WELFARE INDICATORS</span>
              </div>
              <button
                onClick={() => setShowAllParams(p => !p)}
                className="flex items-center gap-1.5 px-2 py-1 rounded transition-all"
                style={{ border: '1px solid #1c3652', fontSize: 10, color: showAllParams ? '#e8a030' : '#4b6280',
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', background: showAllParams ? 'rgba(232,160,48,0.08)' : 'none', cursor: 'pointer' }}>
                {showAllParams ? 'Hide' : 'View All Parameters'} {showAllParams ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            </div>
            <div className="p-2.5 flex gap-2">
              {welfareStats.map(stat => <WelfareRing key={stat.label} stat={stat} />)}
            </div>
            {/* All Parameters Grid */}
            {showAllParams && (() => {
              const paramDeltas: Record<string, number> = {}
              if (lastTurn?.city_params_after && lastTurn?.city_params_before) {
                for (const [k, v] of Object.entries(lastTurn.city_params_after)) {
                  paramDeltas[k] = v - (lastTurn.city_params_before[k] ?? v)
                }
              }
              const barColor = (v: number) => v > 65 ? '#22c55e' : v > 35 ? '#f59e0b' : '#f87171'
              const groups: { label: string; params: [string, string][] }[] = [
                { label: 'HEALTH', params: [['hospitals_and_clinics', 'Hospitals & Clinics'], ['air_quality_and_pollution', 'Air Quality']] },
                { label: 'WEALTH', params: [['jobs_and_commerce', 'Jobs & Commerce'], ['affordable_housing', 'Affordable Housing']] },
                { label: 'SAFETY', params: [['police_and_emergency', 'Police & Emergency'], ['courts_and_legal', 'Courts & Legal']] },
                { label: 'SOCIETY', params: [['community_and_spaces', 'Community & Spaces'], ['schools_and_universities', 'Schools & Universities']] },
                { label: 'INFRASTRUCTURE', params: [['transit_and_roads', 'Transit & Roads'], ['water_power_sanitation', 'Water & Sanitation']] },
                { label: 'GOVERNANCE', params: [['admin_efficiency', 'Admin Efficiency'], ['anti_corruption', 'Anti-Corruption'], ['media_freedom', 'Media Freedom']] },
              ]
              return (
                <div style={{ borderTop: '1px solid #1c3652', padding: '8px 12px 10px' }}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                    {groups.map(g => (
                      <div key={g.label} className="mb-2">
                        <div style={{ ...HDR_LABEL, fontSize: 8, marginBottom: 4, color: '#6b7280' }}>{g.label}</div>
                        {g.params.map(([key, label]) => {
                          const val = (cp as unknown as Record<string, number>)[key] ?? 0
                          const delta = paramDeltas[key] ?? 0
                          const roundDelta = Math.round(delta)
                          return (
                            <div key={key} className="flex items-center gap-2 mb-1" style={{ height: 18 }}>
                              <span style={{ fontSize: 9, color: '#94a3b8', width: 90, flexShrink: 0 }} className="truncate">{label}</span>
                              <MiniBar value={val} color={barColor(val)} width={50} />
                              <span style={{ fontSize: 9, ...MONO('#fff'), width: 20, textAlign: 'right' }}>{Math.round(val)}</span>
                              {roundDelta !== 0 && (
                                <span style={{ fontSize: 8, fontFamily: "'Share Tech Mono', monospace",
                                  color: roundDelta > 0 ? '#4ade80' : '#f87171' }}>
                                  {roundDelta > 0 ? `▲+${roundDelta}` : `▼${roundDelta}`}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Game Stream */}
          <div style={PANEL} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: 'rgba(232,160,48,0.15)', border: '1px solid #92400e' }}>
                  <span style={{ color: '#e8a030', fontSize: 10 }}>▶</span>
                </div>
                <span style={HDR_LABEL}>GAME STREAM</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #991b1b' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ boxShadow: '0 0 4px #f87171' }} />
                <span style={{
                  color: '#f87171', fontSize: 9, fontWeight: 700,
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em'
                }}>LIVE</span>
              </div>
            </div>

            {/* Stream Image Banner */}
            <div className="relative shrink-0 overflow-hidden" style={{ height: 185, background: '#050d1b' }}>
              {isTurnExecuting ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="absolute inset-0 z-0 bg-cover bg-center opacity-30 saturate-50" style={{
                    backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop")',
                  }} />
                  <div className="z-10 flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin" size={32} color="#4ade80" />
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: '0.15em', color: '#4ade80' }}>
                      IMPLEMENTING POLICY...
                    </div>
                    <div style={{ fontSize: 13, ...MONO('#fff') }}>
                      {executingPolicyName}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <img src={streamImg} alt={streamTitle} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(5,13,27,0.97) 0%, rgba(5,13,27,0.3) 55%, transparent 100%)' }} />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded"
                    style={{ background: 'rgba(5,13,27,0.7)', border: '1px solid rgba(232,160,48,0.3)', backdropFilter: 'blur(4px)' }}>
                    <span style={{
                      color: '#e8a030', fontSize: 9, fontFamily: "'Rajdhani', sans-serif",
                      letterSpacing: '0.12em', fontWeight: 700
                    }}>
                      TURN {gameState.current_turn} · {lastTurn ? 'LAST ACTION' : 'OVERVIEW'}
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="text-white uppercase tracking-wide"
                      style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>
                      {streamTitle}
                    </div>
                    {streamLocation && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin size={10} color="#94a3b8" />
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{streamLocation}</span>
                      </div>
                    )}
                    {streamEffects.length > 0 && (
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {streamEffects.map((effect, i) => (
                          <span key={i} className="flex items-center gap-1"
                            style={{
                              fontSize: 10, fontWeight: 700, color: effect.color,
                              fontFamily: "'Share Tech Mono', monospace"
                            }}>
                            <span style={{ fontSize: 8 }}>{effect.up ? '▲' : '▼'}</span>
                            {effect.label}
                          </span>
                        ))}
                        <button className="ml-auto flex items-center justify-center rounded transition-all"
                          style={{
                            width: 20, height: 20, background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
                          }}>
                          <Info size={11} color="#94a3b8" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Turn History */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {turnHistory.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '16px' }}>
                  No turns played yet. Press NEXT TURN to begin.
                </div>
              )}
              {turnHistory.map((entry, i) => (
                <TurnPhaseCard
                  key={entry.turn}
                  entry={entry}
                  ministers={gameState.ministers}
                  onToggle={() => setTurnHistory(prev =>
                    prev.map((e, j) => j === i ? { ...e, expanded: !e.expanded } : e)
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Identity + Media + City Chatter ──────────────────────── */}
        <div className="w-[280px] flex flex-col gap-2 shrink-0">

          {/* Identity Groups */}
          <div style={PANEL} className="shrink-0">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px #a855f7' }} />
                <span style={HDR_LABEL}>IDENTITY GROUPS</span>
              </div>
              <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', color: '#4b6280' }}>
                APPROVAL · TREND
              </span>
            </div>
            <div className="px-2 py-1.5 space-y-0.5">
              {wardReport.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>
                  Data available after first turn
                </div>
              )}
              {wardReport.slice(0, 6).map((entry, i) => {
                const col = entry.hotspot ? '#f87171' : entry.bright_spot ? '#22c55e' : '#e8a030'
                const approvalVal = Math.min(100, Math.max(0, 50 + entry.avg_wellbeing_delta * 5))
                return (
                  <div key={i}
                    className="flex items-center gap-2 px-1.5 py-1.5 rounded cursor-pointer transition-all"
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <span style={{ fontSize: 11, color: '#94a3b8', width: 14, textAlign: 'center' }}>
                      {entry.group_type === 'religion' ? '🕉' : entry.group_type === 'profession' ? '⚙' : '⬡'}
                    </span>
                    <span className="flex-1 text-gray-300 truncate" style={{ fontSize: 11 }}>{entry.group_name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <MiniBar value={approvalVal} color={col} width={36} />
                      <span style={{ fontSize: 10, fontWeight: 700, ...MONO(col), width: 20, textAlign: 'right' }}>
                        {Math.round(approvalVal)}
                      </span>
                    </div>
                    <div className="w-px h-3" style={{ background: '#1c3652' }} />
                    <span style={{ fontSize: 10, color: entry.trend === 'up' ? '#22c55e' : entry.trend === 'down' ? '#f87171' : '#64748b' }}>
                      {entry.trend === 'up' ? '▲' : entry.trend === 'down' ? '▼' : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Media */}
          <div style={PANEL} className="shrink-0">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <Newspaper size={11} color="#e8a030" />
                <span style={HDR_LABEL}>MEDIA</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={10} color="#22c55e" />
                <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", color: '#4b6280' }}>Campaign Rate</span>
              </div>
            </div>
            <div className="p-2 space-y-2">
              {mediaHeadlines.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>
                  Headlines appear after first turn
                </div>
              )}
              {mediaHeadlines.slice(0, 3).map((item, i) => {
                const col = leanColor(item.lean)
                const bg = leanBg(item.lean)
                const initials = item.outlet.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={i} className="flex gap-2 p-1.5 rounded cursor-pointer transition-all"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}>
                    <div className="shrink-0 rounded flex items-center justify-center"
                      style={{
                        width: 32, height: 32, background: bg,
                        border: `1px solid ${col}44`, fontSize: 9, fontWeight: 700, color: col,
                        fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
                        boxShadow: `0 0 8px ${bg}88`
                      }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{item.outlet}</span>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.45 }}>
                        {item.headline}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {mediaHeadlines.length > 0 && (
              <div className="px-2 pb-2">
                <button className="w-full py-1.5 rounded transition-all"
                  style={{
                    border: '1px solid #1c3652', fontSize: 10, color: '#4b6280',
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em', background: 'none', cursor: 'pointer'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a030'; e.currentTarget.style.color = '#e8a030' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1c3652'; e.currentTarget.style.color = '#4b6280' }}>
                  VIEW ALL MEDIA
                </button>
              </div>
            )}
          </div>

          {/* City Chatter */}
          <div style={PANEL} className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={11} color="#e8a030" />
                <span style={HDR_LABEL}>CITY CHATTER</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingDown size={10} color="#f87171" />
                <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", color: '#4b6280' }}>Sentiment</span>
              </div>
            </div>
            <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
              {citizenVoices.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>
                  Citizen voices appear after first turn
                </div>
              )}
              {citizenVoices.slice(0, 4).map((v, i) => {
                const ring = sentimentRing(v.sentiment)
                return (
                  <div key={i} className="flex gap-2">
                    <div className="shrink-0" style={{ position: 'relative', width: 30, height: 30 }}>
                      <Avatar seed={v.name} size={30} ring={ring} />
                      <div className="absolute bottom-0 right-0 rounded-full"
                        style={{
                          width: 7, height: 7,
                          background: v.sentiment === 'approve' ? '#22c55e' : v.sentiment === 'disapprove' ? '#f87171' : '#e8a030',
                          border: '1px solid #050d1b', boxShadow: `0 0 4px ${ring}`
                        }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#7dd3fc' }}>{v.name}</span>
                        <span style={{ fontSize: 9, color: '#475569' }}>{v.demographics_summary}</span>
                      </div>
                      <div className="mt-1 px-2 py-1.5 rounded"
                        style={{
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(28,54,82,0.6)',
                          fontSize: 10, color: '#94a3b8', lineHeight: 1.5
                        }}>
                        {v.reaction}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
