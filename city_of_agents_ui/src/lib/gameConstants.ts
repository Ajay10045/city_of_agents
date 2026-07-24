import type { MinorActionType, CounterFrameStrategy } from '../types'

export const BRIEFING_THINKING_MAX_CHARS = 12000

export const GAMEPLAY_V2_AGENCY = String(import.meta.env.VITE_GAMEPLAY_V2_AGENCY ?? '1') !== '0'

export const MINOR_ACTION_CHOICES: { type: MinorActionType; label: string; defaultTarget?: string; defaultBudget: number }[] = [
  { type: 'maintenance', label: 'Sector Maintenance', defaultTarget: 'transit_and_roads', defaultBudget: 50 },
  { type: 'banking', label: 'Budget Banking', defaultBudget: 0 },
  { type: 'reshuffle', label: 'Cabinet Reshuffle', defaultTarget: 'rotation', defaultBudget: 0 },
  { type: 'press_conference', label: 'Press Conference', defaultTarget: 'middle_class', defaultBudget: 30 },
  { type: 'emergency_fund', label: 'Emergency Fund', defaultTarget: 'active_crisis', defaultBudget: 60 },
  { type: 'governance_upkeep', label: 'Governance Upkeep', defaultTarget: 'admin_efficiency', defaultBudget: 60 },
]

export const COUNTER_FRAME_CHOICES: CounterFrameStrategy[] = [
  'Delivery Receipts',
  'Empathy + Relief',
  'Accountability Pivot',
  'Attack the Attacker',
  'Populist Counter',
]

// ─── Portfolio image map ───────────────────────────────────────────────────────

export const PORTFOLIO_IMG: Record<string, string> = {
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
export const DEFAULT_IMG = 'https://images.unsplash.com/photo-1596430212278-7f7b1d0c9a4e?q=80&w=1200&auto=format&fit=crop'
