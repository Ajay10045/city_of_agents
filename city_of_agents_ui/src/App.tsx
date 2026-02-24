import { useState } from 'react'
import CitySelectionScreen from './screens/CitySelectionScreen'
import CabinetScreen from './screens/CabinetScreen'
import GameDashboard from './screens/GameDashboard'
import type { GameState } from './types'

type Screen = 'city_selection' | 'cabinet' | 'game'

interface GameContext {
  gameId: string
  state: GameState
  profile: Record<string, unknown>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('city_selection')
  const [ctx, setCtx] = useState<GameContext | null>(null)

  function handleGameCreated(gameId: string, state: GameState, profile: Record<string, unknown>) {
    setCtx({ gameId, state, profile })
    setScreen('cabinet')
  }

  function handleCabinetFormed(state: GameState) {
    setCtx(prev => prev ? { ...prev, state } : null)
    setScreen('game')
  }

  return (
    <>
      {screen === 'city_selection' && (
        <CitySelectionScreen onGameCreated={handleGameCreated} />
      )}
      {screen === 'cabinet' && ctx && (
        <CabinetScreen
          gameId={ctx.gameId}
          state={ctx.state}
          onCabinetFormed={handleCabinetFormed}
        />
      )}
      {screen === 'game' && ctx && (
        <GameDashboard
          gameId={ctx.gameId}
          initialState={ctx.state}
        />
      )}
    </>
  )
}
