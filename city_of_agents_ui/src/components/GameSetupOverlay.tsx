import { useEffect, useMemo, useState } from 'react'
import type { GameSetupConfig, SetupOptions } from '../types'

type Props = {
  visible: boolean
  options: SetupOptions | null
  initialConfig: GameSetupConfig | null
  busy: boolean
  profileRefreshCityId?: string | null
  error: string | null
  canCancel: boolean
  onCancel: () => void
  onStart: (config: GameSetupConfig) => void
  onRefreshCityProfile: (cityId: string) => void
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export default function GameSetupOverlay({
  visible,
  options,
  initialConfig,
  busy,
  profileRefreshCityId,
  error,
  canCancel,
  onCancel,
  onStart,
  onRefreshCityProfile,
}: Props) {
  const [draft, setDraft] = useState<GameSetupConfig | null>(initialConfig)

  useEffect(() => {
    setDraft(initialConfig)
  }, [initialConfig, visible])

  const validationError = useMemo(() => {
    if (!draft || !options) return null
    if (draft.turns < options.limits.turns.min || draft.turns > options.limits.turns.max) {
      return `turns must be between ${options.limits.turns.min} and ${options.limits.turns.max}`
    }
    if (
      draft.agent_count < options.limits.agent_count.min ||
      draft.agent_count > options.limits.agent_count.max
    ) {
      return `agent_count must be between ${options.limits.agent_count.min} and ${options.limits.agent_count.max}`
    }
    return null
  }, [draft, options])

  if (!visible) return null

  const selectedCity = options?.cities.find((city) => city.id === draft?.city_id) ?? null

  const onIntField = (key: 'turns' | 'agent_count', min: number, max: number) => (value: string) => {
    if (!draft) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const next = clampInt(parsed, min, max)
    setDraft({ ...draft, [key]: next })
  }

  const submit = () => {
    if (!draft || validationError) return
    onStart(draft)
  }

  return (
    <div className="overlay" id="setup-overlay">
      <div className="setup-card">
        <h2>Game Setup</h2>
        <p className="setup-subtitle">Configure city, turns, and agent count.</p>

        {!options || !draft ? (
          <div className="muted">Loading setup defaults…</div>
        ) : (
          <>
            <div className="setup-grid">
              <label className="setup-field">
                <span>Total Turns</span>
                <input
                  type="number"
                  min={options.limits.turns.min}
                  max={options.limits.turns.max}
                  value={draft.turns}
                  onChange={(e) =>
                    onIntField('turns', options.limits.turns.min, options.limits.turns.max)(e.target.value)
                  }
                />
              </label>

              <label className="setup-field">
                <span>City</span>
                <select
                  value={draft.city_id}
                  onChange={(e) => setDraft({ ...draft, city_id: e.target.value })}
                >
                  {options.cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setup-field">
                <span>Agent Count</span>
                <input
                  type="number"
                  min={options.limits.agent_count.min}
                  max={options.limits.agent_count.max}
                  step={1}
                  value={draft.agent_count}
                  onChange={(e) =>
                    onIntField(
                      'agent_count',
                      options.limits.agent_count.min,
                      options.limits.agent_count.max,
                    )(e.target.value)
                  }
                />
              </label>
            </div>

            {selectedCity && (
              <div className="setup-city-profile">
                <div className="setup-city-profile-meta">
                  <strong>City Profile:</strong>{' '}
                  {selectedCity.profile_ready ? (
                    <span className="profile-ready">ready</span>
                  ) : (
                    <span className="profile-missing">missing</span>
                  )}
                  {selectedCity.profile_version && (
                    <span className="muted"> · {selectedCity.profile_version}</span>
                  )}
                  {selectedCity.last_generated_at && (
                    <span className="muted"> · {selectedCity.last_generated_at}</span>
                  )}
                </div>
                {selectedCity.last_error && (
                  <div className="muted">Last profile error: {selectedCity.last_error}</div>
                )}
                <button
                  className="btn-ghost"
                  onClick={() => onRefreshCityProfile(selectedCity.id)}
                  disabled={busy || profileRefreshCityId === selectedCity.id}
                >
                  {profileRefreshCityId === selectedCity.id ? 'Refreshing…' : 'Generate/Refresh Profile'}
                </button>
              </div>
            )}
          </>
        )}

        {validationError && <div className="setup-error">{validationError}</div>}
        {error && <div className="setup-error">{error}</div>}

        <div className="setup-actions">
          {canCancel && (
            <button className="btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          <button className="btn-continue" onClick={submit} disabled={busy || Boolean(validationError)}>
            {busy ? 'Starting…' : 'Start Simulation'}
          </button>
        </div>
      </div>
    </div>
  )
}
