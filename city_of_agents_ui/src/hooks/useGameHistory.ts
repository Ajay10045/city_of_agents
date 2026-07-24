import { useEffect, useState } from 'react'
import { getHistory } from '../api'
import type { TurnResult } from '../types'

/**
 * Fetches the full turn history whenever the turn count changes.
 * Used to drive trend charts without re-deriving state client-side.
 */
export function useGameHistory(gameId: string, turnCount: number): TurnResult[] {
  const [turns, setTurns] = useState<TurnResult[]>([])

  useEffect(() => {
    if (turnCount === 0) return
    let cancelled = false
    getHistory(gameId)
      .then(res => { if (!cancelled) setTurns(res.turns) })
      .catch(() => { /* trends are non-critical; keep last good data */ })
    return () => { cancelled = true }
  }, [gameId, turnCount])

  return turns
}
