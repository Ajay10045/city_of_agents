import type { Minister } from '../types'

export const MINISTER_COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#d97706', '#be185d']

// Detect @mention or direct name reference in a message.
// ─── Portfolio → keywords that signal relevance to this minister ──────────────
export const PORTFOLIO_KEYWORDS: Record<string, string[]> = {
  'Finance & Economy': ['budget', 'tax', 'revenue', 'economy', 'jobs', 'commerce', 'trade', 'fiscal', 'debt', 'spend', 'cost', 'money', 'treasury', 'finance'],
  'Infrastructure': ['road', 'transit', 'metro', 'water', 'power', 'sanitation', 'transport', 'infrastructure', 'grid', 'highway', 'bridge', 'rail'],
  'Health & Education': ['hospital', 'clinic', 'health', 'school', 'university', 'education', 'doctor', 'teacher', 'student', 'medical', 'healthcare'],
  'Housing & Community': ['housing', 'house', 'home', 'community', 'park', 'space', 'affordable', 'rent', 'slum', 'neighbourhood', 'neighborhood'],
  'Home Affairs': ['police', 'crime', 'law', 'court', 'legal', 'security', 'enforcement', 'emergency', 'justice', 'arrest', 'order'],
  'Environment': ['air', 'pollution', 'environment', 'climate', 'green', 'emission', 'waste', 'clean', 'ecological'],
  'Governance Reform': ['corruption', 'reform', 'efficiency', 'media', 'transparency', 'admin', 'governance', 'bureaucracy', 'press', 'freedom'],
}

// Score how relevant a minister is to the message (higher = more relevant)
export function relevanceScore(minister: Minister, msgLower: string): number {
  let score = 0

  // Portfolio keyword match — primary signal
  const keywords = PORTFOLIO_KEYWORDS[minister.portfolio] ?? []
  for (const kw of keywords) {
    if (msgLower.includes(kw)) score += 3
  }
  // Extra portfolios also count but weighted less
  for (const ep of (minister.extra_portfolios ?? [])) {
    const epKws = PORTFOLIO_KEYWORDS[ep] ?? []
    for (const kw of epKws) {
      if (msgLower.includes(kw)) score += 1.5
    }
  }

  // Personality: high ambition → more eager to chime in
  const ambition = (minister.personality?.['ambition'] ?? 50) / 100
  score += ambition * 0.8

  // Low loyalty → more likely to speak up / push back
  const loyalty = minister.loyalty ?? 50
  if (loyalty < 40) score += 0.6

  // Tiny random jitter so same-score ministers don't always respond in the same order
  score += Math.random() * 0.4

  return score
}

// Parse direct @name mentions — returns indices of ministers explicitly addressed
export function parseMentioned(msg: string, ministers: Minister[]): number[] {
  const lower = msg.toLowerCase()
  const mentioned: number[] = []
  ministers.forEach((m, idx) => {
    const parts = m.name.toLowerCase().split(' ')
    if (
      lower.includes(`@${parts[0]}`) ||
      lower.includes(`@${m.name.toLowerCase().replace(/ /g, '')}`)
    ) {
      mentioned.push(idx)
    }
  })
  return mentioned
}

export const BROADCAST_RE = /(?:^|\s)@\s*(?:all|everyone)(?:\s|$)/i

// Phrases that signal the mayor wants to draft / finalise the policy
export const DRAFT_INTENT_RE = /\b(draft|finali[sz]e|conclud|let'?s\s+(do\s+it|go ahead|proceed|wrap\s*up)|ok\s+approved|approved|let'?s\s+draft|draft\s+(the\s+)?polic|update\s+(the\s+)?polic|amend\s+(the\s+)?polic)\b/i

/**
 * Select which ministers should respond.
 *
 * Modes:
 *  - Direct @name  → only that minister replies (ends cabinet session)
 *  - @all / @everyone  → all ministers respond, ordered by relevance
 *  - Cabinet in session (cabinetHot) → top 2-3 relevant ministers jump in
 *  - No session, no mention → most relevant minister; 40% chance second joins
 */
export function selectResponders(msg: string, ministers: Minister[], cabinetHot = false): number[] {
  const lower = msg.toLowerCase()
  const directMentions = parseMentioned(msg, ministers)
  const isBroadcast = BROADCAST_RE.test(msg)

  // Score everyone
  const scored = ministers.map((m, i) => ({ i, score: relevanceScore(m, lower) }))
  scored.sort((a, b) => b.score - a.score)

  // Direct @name → only that minister (closes cabinet session)
  if (directMentions.length > 0) {
    return [...new Set(directMentions)]
  }

  // @all → everyone speaks
  if (isBroadcast) {
    return scored.map(s => s.i)
  }

  // Cabinet still in session from a prior @all → relevant ministers stay engaged
  if (cabinetHot) {
    // Always include the top scorer; others join if score ≥ 2 (loosely relevant)
    const result = [scored[0].i]
    for (let k = 1; k < scored.length && result.length < 3; k++) {
      if (scored[k].score >= 2) result.push(scored[k].i)
    }
    // Guarantee at least 2 so the room feels active
    if (result.length < 2 && scored.length > 1) result.push(scored[1].i)
    return result
  }

  // No session, no mention → most relevant minister; second joins rarely
  const first = scored[0]
  if (!first) return []
  const result = [first.i]
  const second = scored[1]
  if (second && second.score >= 3 && Math.random() < 0.4) {
    result.push(second.i)
  }
  return result
}
