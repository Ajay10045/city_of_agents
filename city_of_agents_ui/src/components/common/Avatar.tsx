import type { Minister } from '../../types'
import { getPortraitForMinister } from '../../lib/gameUtils'

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ seed, size = 28, ring = '#1c3652' }: { seed: string; size?: number; ring?: string }) {
  return (
    <img
      src={`https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1e3a5f,0f2942,1a2f4a`}
      alt={seed}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: `1.5px solid ${ring}`, background: '#0b1929' }}
    />
  )
}

// ─── Agent Avatar (Demographic Match) ────────────────────────────────────────

export function AgentAvatar({ seed, ministers = [], size = 28, ring = '#1c3652' }: { seed: string; ministers?: Minister[]; size?: number; ring?: string }) {
  const src = getPortraitForMinister(seed, ministers)
  return (
    <img
      src={src}
      alt={seed}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: `1.5px solid ${ring}`, background: '#0b1929' }}
    />
  )
}
