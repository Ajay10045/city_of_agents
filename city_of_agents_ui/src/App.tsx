import { useState } from 'react'
import CitySelectionScreen from './screens/CitySelectionScreen'
import CabinetScreen from './screens/CabinetScreen'
import GameDashboard from './screens/GameDashboard'
import PhoneGame from './screens/PhoneGame'
import type { GameState } from './types'

type GameMode = 'phone' | 'classic'
type Screen = 'mode_select' | 'city_selection' | 'cabinet' | 'game' | 'phone'

interface GameContext {
  gameId: string
  state: GameState
  profile: Record<string, unknown>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('mode_select')
  const [ctx, setCtx] = useState<GameContext | null>(null)

  function handleGameCreated(gameId: string, state: GameState, profile: Record<string, unknown>) {
    setCtx({ gameId, state, profile })
    setScreen('cabinet')
  }

  function handleCabinetFormed(state: GameState) {
    setCtx(prev => prev ? { ...prev, state } : null)
    setScreen('game')
  }

  function selectMode(mode: GameMode) {
    if (mode === 'phone') {
      setScreen('phone')
    } else {
      setScreen('city_selection')
    }
  }

  /* ---- Mode Select ---- */
  if (screen === 'mode_select') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 100%)',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#E8E8E8', fontSize: 32, marginBottom: 8, fontWeight: 700 }}>
            City of Agents
          </h1>
          <p style={{ color: '#888', fontSize: 15, marginBottom: 32 }}>
            Choose your experience
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => selectMode('phone')} style={{
              background: 'linear-gradient(135deg, #6C5CE7, #A855F7)',
              border: 'none', borderRadius: 16, padding: '24px 32px',
              cursor: 'pointer', width: 200, textAlign: 'left' as const,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
              <div style={{ color: 'white', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                The Mayor's Phone
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                AI-native chat interface. Conversations are the gameplay.
              </div>
            </button>
            <button onClick={() => selectMode('classic')} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '24px 32px',
              cursor: 'pointer', width: 200, textAlign: 'left' as const,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏛️</div>
              <div style={{ color: '#E8E8E8', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                Classic Dashboard
              </div>
              <div style={{ color: '#888', fontSize: 12 }}>
                Policy cards, turn-based mechanics, data dashboard.
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ---- Phone Game ---- */
  if (screen === 'phone') {
    return <PhoneGame />
  }

  /* ---- Classic Flow ---- */
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

