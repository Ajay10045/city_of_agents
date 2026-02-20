import { useEffect, useMemo, useState } from 'react'
import type { GameSetupConfig, SamplingStrategy, SetupOptions } from '../types'

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

function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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
    if (!draft) return null
    if (draft.turns_to_election > draft.turns) {
      return 'turns_to_election cannot be greater than total turns'
    }
    if (draft.llm_sampling_strategy !== 'none' && draft.llm_panel_size < 50) {
      return "llm_panel_size must be at least 50 unless sampling strategy is 'none'"
    }
    if (draft.llm_panel_size > draft.agent_count) {
      return 'llm_panel_size cannot be greater than agent_count'
    }
    return null
  }, [draft])

  if (!visible) return null

  const selectedCity = options?.cities.find((city) => city.id === draft?.city_id) ?? null

  const onIntField =
    (
      key:
        | 'turns'
        | 'turns_to_election'
        | 'population_scale'
        | 'agent_count'
        | 'llm_panel_size'
        | 'llm_micro_batch_size'
        | 'max_parallel_llm_requests',
      min: number,
      max: number,
    ) =>
    (value: string) => {
      if (!draft) return
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return
      const next = clampInt(parsed, min, max)
      setDraft({ ...draft, [key]: next })
    }

  const onRandomnessField = (value: string) => {
    if (!draft) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    setDraft({
      ...draft,
      randomness_scale: Number(clampFloat(parsed, 0.0, 1.0).toFixed(2)),
    })
  }

  const onSamplingStrategy = (strategy: SamplingStrategy) => {
    if (!draft) return
    setDraft({
      ...draft,
      llm_sampling_strategy: strategy,
      llm_panel_size: strategy === 'none' ? 0 : Math.max(50, draft.llm_panel_size),
    })
  }

  const submit = () => {
    if (!draft || validationError) return
    onStart(draft)
  }

  return (
    <div className="overlay" id="setup-overlay">
      <div className="setup-card">
        <h2>Game Setup</h2>
        <p className="setup-subtitle">Configure city, election horizon, and simulation scale.</p>

        {!options || !draft ? (
          <div className="muted">Loading setup defaults…</div>
        ) : (
          <>
            <div className="setup-grid">
              <label className="setup-field">
                <span>Total Turns</span>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={draft.turns}
                  onChange={(e) => onIntField('turns', 1, 300)(e.target.value)}
                />
              </label>

              <label className="setup-field">
                <span>Turns To Election</span>
                <input
                  type="number"
                  min={options.limits.turns_to_election.min}
                  max={Math.min(options.limits.turns_to_election.max, draft.turns)}
                  value={draft.turns_to_election}
                  onChange={(e) =>
                    onIntField(
                      'turns_to_election',
                      options.limits.turns_to_election.min,
                      Math.min(options.limits.turns_to_election.max, draft.turns),
                    )(e.target.value)
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
                <span>Population Scale</span>
                <input
                  type="number"
                  min={options.limits.population_scale.min}
                  max={options.limits.population_scale.max}
                  step={1000}
                  value={draft.population_scale}
                  onChange={(e) =>
                    onIntField(
                      'population_scale',
                      options.limits.population_scale.min,
                      options.limits.population_scale.max,
                    )(e.target.value)
                  }
                />
              </label>

              <label className="setup-field">
                <span>Agent Count</span>
                <input
                  type="number"
                  min={options.limits.agent_count.min}
                  max={options.limits.agent_count.max}
                  step={500}
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

              <label className="setup-field">
                <span>LLM Sampling</span>
                <select
                  value={draft.llm_sampling_strategy}
                  onChange={(e) => onSamplingStrategy(e.target.value as SamplingStrategy)}
                >
                  {options.limits.llm_sampling_strategy.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {strategy}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setup-field">
                <span>LLM Panel Size</span>
                <input
                  type="number"
                  min={options.limits.llm_panel_size.min}
                  max={Math.min(options.limits.llm_panel_size.max, draft.agent_count)}
                  step={50}
                  value={draft.llm_panel_size}
                  disabled={draft.llm_sampling_strategy === 'none'}
                  onChange={(e) =>
                    onIntField(
                      'llm_panel_size',
                      options.limits.llm_panel_size.min,
                      Math.min(options.limits.llm_panel_size.max, draft.agent_count),
                    )(e.target.value)
                  }
                />
              </label>

              <label className="setup-field">
                <span>LLM Micro Batch Size</span>
                <input
                  type="number"
                  min={options.limits.llm_micro_batch_size.min}
                  max={options.limits.llm_micro_batch_size.max}
                  value={draft.llm_micro_batch_size}
                  onChange={(e) =>
                    onIntField(
                      'llm_micro_batch_size',
                      options.limits.llm_micro_batch_size.min,
                      options.limits.llm_micro_batch_size.max,
                    )(e.target.value)
                  }
                />
              </label>

              <label className="setup-field">
                <span>Max Parallel LLM Requests</span>
                <input
                  type="number"
                  min={options.limits.max_parallel_llm_requests.min}
                  max={options.limits.max_parallel_llm_requests.max}
                  value={draft.max_parallel_llm_requests}
                  onChange={(e) =>
                    onIntField(
                      'max_parallel_llm_requests',
                      options.limits.max_parallel_llm_requests.min,
                      options.limits.max_parallel_llm_requests.max,
                    )(e.target.value)
                  }
                />
              </label>

              <label className="setup-field">
                <span>Randomness Scale (0.0-1.0)</span>
                <input
                  type="number"
                  min={options.limits.randomness_scale.min}
                  max={options.limits.randomness_scale.max}
                  step={0.01}
                  value={draft.randomness_scale}
                  onChange={(e) => onRandomnessField(e.target.value)}
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
