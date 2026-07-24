import type { EffectKind } from './mapEffectsUtil'

// ─── Individual effect sprites (rendered inside the map SVG) ─────────────────

function Fire({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={16} fill="#f97316" opacity={0.12} className="coa-pulse" />
      <path d="M0,-13 C4,-8 7,-5 7,0 C7,5 4,8 0,8 C-4,8 -7,5 -7,0 C-7,-5 -4,-8 0,-13Z"
        fill="#f97316" className="coa-flicker" />
      <path d="M0,-7 C2,-4 4,-2.5 4,0.5 C4,3.5 2,5 0,5 C-2,5 -4,3.5 -4,0.5 C-4,-2.5 -2,-4 0,-7Z"
        fill="#fbbf24" className="coa-flicker2" />
      <circle cx={-3} cy={-17} r={2.4} fill="#64748b" opacity={0.5} className="coa-smoke" />
      <circle cx={3} cy={-21} r={3.2} fill="#64748b" opacity={0.35} className="coa-smoke2" />
    </g>
  )
}

function Flood({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse rx={22} ry={9} fill="#38bdf8" opacity={0.2} className="coa-pulse" />
      <path d="M-16,0 Q-12,-4 -8,0 T0,0 T8,0 T16,0" fill="none" stroke="#7dd3fc" strokeWidth={2}
        strokeLinecap="round" className="coa-wave" />
      <path d="M-12,5 Q-8,1 -4,5 T4,5 T12,5" fill="none" stroke="#38bdf8" strokeWidth={1.6}
        strokeLinecap="round" className="coa-wave2" />
    </g>
  )
}

function Protest({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={15} fill="#f87171" opacity={0.1} className="coa-pulse" />
      <g className="coa-bob">
        <rect x={-9} y={-14} width={8} height={6} rx={1} fill="#e2e8f0" />
        <line x1={-5} y1={-8} x2={-5} y2={2} stroke="#94a3b8" strokeWidth={1.4} />
      </g>
      <g className="coa-bob2">
        <rect x={2} y={-17} width={8} height={6} rx={1} fill="#fca5a5" />
        <line x1={6} y1={-11} x2={6} y2={2} stroke="#94a3b8" strokeWidth={1.4} />
      </g>
    </g>
  )
}

function Outbreak({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={5} fill="#f87171" opacity={0.8} />
      <circle r={8} fill="none" stroke="#f87171" strokeWidth={1.5} className="coa-ring" />
      <circle r={8} fill="none" stroke="#f87171" strokeWidth={1.5} className="coa-ring2" />
    </g>
  )
}

function Quake({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} className="coa-shake">
      <path d="M-14,4 L-6,1 L-2,6 L3,-1 L8,3 L14,-2" fill="none" stroke="#f59e0b"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-10,-4 L-4,-6 L1,-2 L7,-7" fill="none" stroke="#b45309"
        strokeWidth={1.5} strokeLinecap="round" />
    </g>
  )
}

function Haze({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse rx={26} ry={12} fill="#f59e0b" opacity={0.14} className="coa-drift" />
      <ellipse rx={18} ry={8} cx={6} fill="#fb923c" opacity={0.12} className="coa-drift2" />
    </g>
  )
}

function Blackout({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={14} fill="#0a0f1c" opacity={0.55} className="coa-pulse" />
      <path d="M2,-9 L-4,1 L0,1 L-2,9 L5,-2 L1,-2 Z" fill="#fbbf24" className="coa-flicker" />
    </g>
  )
}

function CrisisGeneric({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} className="coa-pulse">
      <path d="M0,-10 L10,8 L-10,8 Z" fill="rgba(248,113,113,0.2)" stroke="#f87171" strokeWidth={1.5}
        strokeLinejoin="round" />
      <text y={5.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#f87171">!</text>
    </g>
  )
}

function Sparkle({ x, y }: { x: number; y: number }) {
  const star = 'M0,-6 L1.4,-1.4 L6,0 L1.4,1.4 L0,6 L-1.4,1.4 L-6,0 L-1.4,-1.4 Z'
  return (
    <g transform={`translate(${x},${y})`}>
      <path d={star} fill="#4ade80" className="coa-twinkle" />
      <path d={star} transform="translate(10,-8) scale(0.6)" fill="#86efac" className="coa-twinkle2" />
      <path d={star} transform="translate(-9,-5) scale(0.45)" fill="#4ade80" className="coa-twinkle3" />
    </g>
  )
}

function Crane({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={16} fill="#4ade80" opacity={0.08} className="coa-pulse" />
      <line x1={0} y1={8} x2={0} y2={-14} stroke="#86efac" strokeWidth={2} />
      <g className="coa-swing">
        <line x1={0} y1={-14} x2={14} y2={-14} stroke="#86efac" strokeWidth={2} />
        <line x1={0} y1={-14} x2={-6} y2={-10} stroke="#86efac" strokeWidth={1.4} />
        <line x1={11} y1={-14} x2={11} y2={-7} stroke="#4ade80" strokeWidth={1} />
        <rect x={9} y={-7} width={4} height={4} fill="#4ade80" />
      </g>
    </g>
  )
}

const SPRITES: Record<EffectKind, (p: { x: number; y: number }) => React.ReactElement> = {
  fire: Fire,
  flood: Flood,
  protest: Protest,
  outbreak: Outbreak,
  quake: Quake,
  haze: Haze,
  blackout: Blackout,
  crisis_generic: CrisisGeneric,
  sparkle: Sparkle,
  crane: Crane,
}

export function EventSprite({ kind, x, y }: { kind: EffectKind; x: number; y: number }) {
  const Sprite = SPRITES[kind]
  return <Sprite x={x} y={y} />
}
