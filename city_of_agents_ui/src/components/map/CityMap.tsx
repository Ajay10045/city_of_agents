import { useMemo, useState, type ReactNode } from 'react'
import type { WardReportEntry, ActiveEvent } from '../../types'
import {
  buildCityLayout, MAP_W, MAP_H,
  type CityLayout, type DistrictLayout,
} from '../../lib/cityLayout'
import { hashString } from '../../lib/rng'
import { wellbeingFill, windowOpacity } from './mapColors'
import { effectForEvent, eventDistrictIndex, EFFECT_KEYFRAMES } from './mapEffectsUtil'
import { EventSprite } from './EventEffects'
import { DistrictDetailPanel } from './DistrictDetailPanel'

// ─── Living City Map ──────────────────────────────────────────────────────────
// Central SVG scene: procedural districts colored by wellbeing, building
// skylines whose windows glow with prosperity, and animated crisis /
// opportunity effects anchored to their district.

function BuildingGroup({ district, wellbeing }: { district: DistrictLayout; wellbeing: number }) {
  const winOpacity = windowOpacity(wellbeing)
  return (
    <g>
      {district.buildingSpots.map((b, i) => {
        const bx = b.x - b.w / 2
        const by = b.y - b.h
        const rows = Math.max(1, Math.floor(b.h / 8))
        const cols = Math.max(1, Math.floor(b.w / 6))
        const windows: ReactNode[] = []
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const dim = (i * 7 + r * 3 + c * 5) % 5 === 0     // some windows dark, deterministic
            windows.push(
              <rect
                key={`${r}-${c}`}
                x={bx + 2 + c * 6}
                y={by + 3 + r * 8}
                width={2.4}
                height={3.2}
                fill="#f0c040"
                opacity={dim ? winOpacity * 0.25 : winOpacity}
              />,
            )
          }
        }
        return (
          <g key={i}>
            <rect
              x={bx} y={by} width={b.w} height={b.h} rx={1}
              fill="#0d1b2e" stroke="rgba(125,211,252,0.14)" strokeWidth={0.6}
            />
            {windows}
          </g>
        )
      })}
    </g>
  )
}

export function CityMap({
  cityName,
  wardReport,
  activeEvents,
  avgWellbeing,
  approval,
  hoveredDistrict,
  onHoverDistrict,
  overlay,
}: {
  cityName: string
  wardReport: WardReportEntry[]
  activeEvents: ActiveEvent[]
  avgWellbeing: number
  approval: number
  hoveredDistrict?: string | null
  onHoverDistrict?: (name: string | null) => void
  /** Extra SVG content rendered above districts (e.g. the citizen crowd). */
  overlay?: (layout: CityLayout) => ReactNode
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const locations = useMemo(
    () => wardReport.filter(w => w.group_type === 'location'),
    [wardReport],
  )

  const layout = useMemo(
    () => buildCityLayout(
      cityName,
      locations.map(l => ({ name: l.group_name, populationPct: l.population_pct })),
    ),
    [cityName, locations],
  )

  const wardByName = useMemo(() => {
    const m = new Map<string, WardReportEntry>()
    for (const l of locations) m.set(l.group_name, l)
    return m
  }, [locations])

  // Events pinned to districts (crises + opportunities)
  const eventsByDistrict = useMemo(() => {
    const m = new Map<number, ActiveEvent[]>()
    for (const ev of activeEvents) {
      const idx = eventDistrictIndex(ev, layout.districts.length)
      m.set(idx, [...(m.get(idx) ?? []), ev])
    }
    return m
  }, [activeEvents, layout.districts.length])

  // Ambient mood: healthy city → warm glow; failing city → cold gloom
  const health = Math.max(0, Math.min(1, (avgWellbeing * 0.6 + approval * 0.4) / 100))
  const glowOpacity = 0.06 + health * 0.16

  const selectedEntry = selected ? wardByName.get(selected) : null

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 0,
      borderRadius: 10, overflow: 'hidden',
      // Ambient sky fills the whole panel so the map reads full-bleed, not letterboxed.
      background: `radial-gradient(120% 80% at 50% 100%, ${health > 0.5 ? 'rgba(232,160,48,0.14)' : 'rgba(56,89,140,0.10)'} 0%, transparent 55%), linear-gradient(180deg, #050d1c 0%, ${health > 0.5 ? '#0a1526' : '#07101d'} 100%)`,
    }}>
      <style>{EFFECT_KEYFRAMES}</style>
      <style>{`@keyframes coaPanelIn { from { opacity: 0; transform: translateX(10px) } to { opacity: 1; transform: translateX(0) } }
@keyframes coaHotspot { 0%,100% { stroke-opacity: 0.85 } 50% { stroke-opacity: 0.25 } }`}</style>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <radialGradient id="coaGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#e8a030" stopOpacity="1" />
            <stop offset="100%" stopColor="#e8a030" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Ambient ground glow ── */}
        <ellipse cx={MAP_W / 2} cy={MAP_H * 0.92} rx={MAP_W * 0.55} ry={130}
          fill="url(#coaGlow)" opacity={glowOpacity} />

        {/* ── District fills + roads ── */}
        {layout.districts.map(d => {
          const entry = wardByName.get(d.name)
          const wb = entry?.avg_wellbeing ?? 50
          const isHovered = hoveredDistrict === d.name
          const isSelected = selected === d.name
          return (
            <g key={d.name}>
              <path
                d={d.path}
                fill={wellbeingFill(wb)}
                fillOpacity={0.88}
                stroke={isSelected ? '#e8a030' : isHovered ? '#7dd3fc' : '#1c3652'}
                strokeWidth={isSelected || isHovered ? 2 : 1.2}
                style={{ cursor: 'pointer', transition: 'fill 0.6s ease, stroke 0.15s ease' }}
                onMouseEnter={() => onHoverDistrict?.(d.name)}
                onMouseLeave={() => onHoverDistrict?.(null)}
                onClick={() => setSelected(prev => (prev === d.name ? null : d.name))}
              />
              {entry?.hotspot && (
                <path d={d.path} fill="none" stroke="#f87171" strokeWidth={2}
                  style={{ pointerEvents: 'none', animation: 'coaHotspot 1.6s ease-in-out infinite' }} />
              )}
              {entry?.bright_spot && !entry.hotspot && (
                <path d={d.path} fill="none" stroke="#4ade80" strokeWidth={1.4} strokeOpacity={0.5}
                  style={{ pointerEvents: 'none' }} />
              )}
            </g>
          )
        })}

        {/* ── Buildings ── */}
        {layout.districts.map(d => (
          <g key={d.name} style={{ pointerEvents: 'none' }}>
            <BuildingGroup district={d} wellbeing={wardByName.get(d.name)?.avg_wellbeing ?? 50} />
          </g>
        ))}

        {/* ── Labels ── */}
        {layout.districts.map(d => {
          const entry = wardByName.get(d.name)
          const wb = entry ? Math.round(entry.avg_wellbeing) : null
          const wbColor = wb === null ? '#64748b' : wb >= 65 ? '#4ade80' : wb >= 40 ? '#f0c040' : '#f87171'
          const short = d.name.length > 24 ? d.name.slice(0, 22) + '…' : d.name
          return (
            <g key={d.name} style={{ pointerEvents: 'none' }}>
              <text x={d.centroid[0]} y={d.centroid[1] + 4} textAnchor="middle"
                fontSize={d.name.length > 18 ? 9.5 : 11} fontWeight={700}
                fontFamily="'Rajdhani', sans-serif" letterSpacing="0.08em"
                fill="#dbe7f5" style={{ paintOrder: 'stroke', stroke: 'rgba(4,10,20,0.85)', strokeWidth: 3 }}>
                {short.toUpperCase()}
              </text>
              <text x={d.centroid[0]} y={d.centroid[1] + 17} textAnchor="middle"
                fontSize={8.5} fontFamily="'Share Tech Mono', monospace"
                fill={wbColor} style={{ paintOrder: 'stroke', stroke: 'rgba(4,10,20,0.85)', strokeWidth: 2.5 }}>
                {Math.round(d.populationPct)}% POP{wb !== null ? ` · WB ${wb}` : ''}
              </text>
            </g>
          )
        })}

        {/* ── Event effects ── */}
        {layout.districts.map((d, i) => {
          const evs = eventsByDistrict.get(i) ?? []
          return evs.map((ev, j) => {
            const jitter = hashString(ev.id)
            const ox = ((jitter % 60) - 30) + j * 14
            const oy = -26 - ((jitter >> 4) % 18)
            return (
              <g key={ev.id} style={{ pointerEvents: 'none' }}>
                <EventSprite kind={effectForEvent(ev)} x={d.centroid[0] + ox} y={d.centroid[1] + oy} />
              </g>
            )
          })
        })}

        {/* ── Overlay (citizen crowd etc.) ── */}
        {overlay?.(layout)}
      </svg>

      {selectedEntry && (
        <DistrictDetailPanel
          entry={selectedEntry}
          events={activeEvents.filter(ev =>
            eventDistrictIndex(ev, layout.districts.length) ===
            layout.districts.findIndex(d => d.name === selectedEntry.group_name))}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
