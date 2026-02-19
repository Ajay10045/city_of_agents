/* City of Agents – UI logic */

const API = '';  // same-origin

// ── State ──────────────────────────────────────────────────────────────────
let currentState   = null;
let mayorPolicies  = [];   // DynamicPolicy[]
let awaitingTurn   = false;
let lastStatValues = {};
let identityGroups = {};

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await loadState();
  renderAll();
  await loadPolicies();   // LLM call — shows loading state first
}

async function loadState() {
  const res = await fetch(`${API}/api/state`);
  currentState = await res.json();
  identityGroups = currentState.identity_groups || {};
}

async function loadPolicies() {
  el('policy-prompt').innerHTML = '<span class="loading-msg">⏳ Consulting advisors…</span>';
  el('policy-grid').innerHTML = '';
  const res = await fetch(`${API}/api/policies`);
  const data = await res.json();
  mayorPolicies = data.policies || [];
  renderPolicies();
}

// ── New game ───────────────────────────────────────────────────────────────
async function newGame() {
  if (!confirm('Start a new game?')) return;
  el('policy-prompt').innerHTML = '<span class="loading-msg">⏳ Starting new game…</span>';
  el('policy-grid').innerHTML = '';
  const res = await fetch(`${API}/api/new-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  currentState = data.state;
  identityGroups = currentState.identity_groups || {};
  lastStatValues = {};
  awaitingTurn = false;
  mayorPolicies = [];
  hideElectionOverlay();
  hideGameOverOverlay();
  hideTurnResult();
  hideDebates();
  el('stream-panel').style.display = 'none';
  el('stream-area').innerHTML = '';
  renderAll();
  await loadPolicies();
}

// ── Select & submit policy (SSE streaming) ────────────────────────────────
async function selectPolicy(policyId) {
  if (awaitingTurn) return;
  if (currentState.turn_number >= currentState.total_turns) return;

  awaitingTurn = true;
  setCardsDisabled(true);
  highlightCard(policyId);

  // Clear panels and show loading state
  el('debates-container').innerHTML = '';
  el('debates-panel').style.display = 'none';
  el('turn-result').classList.remove('visible');
  const streamArea = el('stream-area');
  streamArea.innerHTML = '';
  el('stream-panel').style.display = 'block';
  el('policy-prompt').innerHTML = '<span class="loading-msg">Simulating turn — watch agents respond in real time…</span>';

  let lastResult = null;

  await new Promise((resolve, reject) => {
    const es = new EventSource(`${API}/api/turn-stream?policy_id=${encodeURIComponent(policyId)}`);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'mayor_action') {
        renderStreamAction('mayor', msg.action);
      } else if (msg.type === 'opposition_action') {
        renderStreamAction('opposition', msg.action);
      } else if (msg.type === 'generated_event') {
        if (msg.event) renderStreamEvent(msg.event);
      } else if (msg.type === 'debate') {
        renderStreamDebate(msg.debate);
      } else if (msg.type === 'done') {
        es.close();
        lastResult = msg;
        lastStatValues = currentState.city_stats ? { ...currentState.city_stats } : {};
        currentState = msg.state;
        identityGroups = currentState.identity_groups || {};
        renderAll(msg);
        if (msg.election_result) {
          setTimeout(() => showElectionOverlay(msg.election_result), 600);
        } else if (msg.game_over) {
          setTimeout(() => showGameOverOverlay(), 600);
        }
        if (!msg.game_over && !msg.election_result) {
          loadPolicies().then(resolve).catch(reject);
        } else if (!msg.game_over) {
          el('policy-prompt').innerHTML = 'Election complete. Continue playing.';
          loadPolicies().then(resolve).catch(reject);
        } else {
          el('policy-prompt').innerHTML = 'The simulation has ended.';
          el('policy-grid').innerHTML = '';
          resolve();
        }
      } else if (msg.type === 'error') {
        es.close();
        el('policy-prompt').innerHTML = `<span style="color:var(--red)">Error: ${msg.message}</span>`;
        reject(new Error(msg.message));
      }
    };

    es.onerror = () => {
      es.close();
      el('policy-prompt').innerHTML = '<span style="color:var(--red)">Stream connection error. Reload and try again.</span>';
      reject(new Error('SSE stream error'));
    };
  }).catch(err => console.error('Turn stream error:', err));

  awaitingTurn = false;
  setCardsDisabled(false);
}

// ── Streaming render helpers ───────────────────────────────────────────────
function renderStreamAction(actor, action) {
  const area = el('stream-area');
  const card = document.createElement('div');
  card.className = `stream-card stream-${actor} fade-in`;
  const label = actor === 'mayor' ? '🏛 Mayor Action' : '⚔ Opposition Response';
  card.innerHTML = `
    <div class="stream-card-label">${label}</div>
    <div class="stream-card-name">${action.name}</div>
    ${action.description ? `<div class="stream-card-desc">${action.description}</div>` : ''}
    ${action.rationale ? `<div class="stream-card-rationale">💡 ${action.rationale}</div>` : ''}`;
  area.appendChild(card);
}

function renderStreamEvent(event) {
  const area = el('stream-area');
  const card = document.createElement('div');
  card.className = 'stream-card stream-event fade-in';
  const severityIcon = event.severity === 'major' ? '🚨' : event.severity === 'moderate' ? '⚠️' : '⚡';
  card.innerHTML = `
    <div class="stream-card-label">${severityIcon} Crisis Emerged</div>
    <div class="stream-card-name">${event.name}</div>
    ${event.description ? `<div class="stream-card-desc">${event.description}</div>` : ''}
    <div class="stream-card-meta">${event.severity} · ${event.type} · ${event.duration} turn${event.duration !== 1 ? 's' : ''}</div>`;
  area.appendChild(card);
}

function renderStreamDebate(debate) {
  const container = el('debates-container');
  el('debates-panel').style.display = 'block';
  const card = document.createElement('div');
  card.className = 'debate-card fade-in';

  const deltas = [
    { label: 'Align', val: debate.alignment_delta },
    { label: 'Morale', val: debate.happiness_delta },
    { label: 'Radical', val: debate.radicalization_delta },
    { label: 'Trust', val: debate.trust_delta },
  ];
  const deltasHtml = deltas
    .filter(d => Math.abs(d.val) >= 0.1)
    .map(d => {
      const cls = d.val > 0 ? 'pos' : 'neg';
      const sign = d.val > 0 ? '+' : '';
      return `<div class="debate-delta">${d.label}: <span class="${cls}">${sign}${d.val.toFixed(1)}</span></div>`;
    }).join('');

  card.innerHTML = `
    <div class="debate-group-name">${debate.group_name}</div>
    <div class="debate-summary">${debate.debate_summary}</div>
    ${debate.notable_quote ? `<div class="debate-quote">"${debate.notable_quote}"</div>` : ''}
    ${deltasHtml ? `<div class="debate-deltas">${deltasHtml}</div>` : ''}`;
  container.appendChild(card);
}

// ── Master render ──────────────────────────────────────────────────────────
function renderAll(turnResult = null) {
  if (!currentState) return;
  renderHeader();
  renderPopularity();
  renderCampaign();
  renderMedia();
  renderCityStats(turnResult ? turnResult.stat_changes : {});
  renderGroups();
  renderEvents(turnResult);
  renderLog();
}

// ── Header ─────────────────────────────────────────────────────────────────
function renderHeader() {
  const s = currentState;
  el('turn-number').textContent = s.turn_number;
  el('total-turns').textContent = s.total_turns;
  const left = s.election_turn - s.turn_number;
  el('election-countdown').textContent = left > 0
    ? `Election in ${left} turn${left === 1 ? '' : 's'}`
    : 'Election passed';
  el('governing-party').textContent = s.governing_party;
  el('seed-display').textContent = s.rng_seed !== null ? `Seed: ${s.rng_seed}` : '';
}

// ── Popularity ─────────────────────────────────────────────────────────────
function renderPopularity() {
  const mayor = currentState.mayor_popularity;
  const opp   = currentState.opposition_popularity;
  setFillWidth('fill-mayor', mayor);
  setFillWidth('fill-opp', opp);
  el('val-mayor').textContent = mayor.toFixed(1) + '%';
  el('val-opp').textContent   = opp.toFixed(1) + '%';
}

// ── Campaign strength ──────────────────────────────────────────────────────
function renderCampaign() {
  const c = currentState.campaign_strength;
  el('camp-mayor').textContent = c.mayor ? c.mayor.toFixed(3) : '—';
  el('camp-opp').textContent   = c.opposition ? c.opposition.toFixed(3) : '—';
}

// ── Media ──────────────────────────────────────────────────────────────────
function renderMedia() {
  const m = currentState.media_state;
  setFillWidth('fill-sens', m.sensationalism);
  el('val-sens').textContent = Math.round(m.sensationalism);
  setFillWidth('fill-trust', m.trust);
  el('val-trust').textContent = Math.round(m.trust);
  const biasPos = ((m.bias + 50) / 100) * 100;
  el('bias-dot').style.left = `${biasPos}%`;
  el('val-bias').textContent = m.bias > 2 ? 'Mayor' : m.bias < -2 ? 'Opp' : 'Neutral';
  const sensEl = el('fill-sens');
  sensEl.className = 'media-fill ' + (m.sensationalism > 65 ? 'danger' : m.sensationalism > 40 ? 'warn' : 'good');
}

// ── City stats ─────────────────────────────────────────────────────────────
const STAT_LABELS = {
  economy: 'Economy', employment: 'Employment', law_and_order: 'Law & Order',
  infrastructure: 'Infrastructure', environment: 'Environment', corruption: 'Corruption',
  social_tension: 'Social Tension', media_freedom: 'Media Freedom', public_trust: 'Public Trust',
};
const BAD_HIGH = new Set(['corruption', 'social_tension']);

function statColor(key, value) {
  if (BAD_HIGH.has(key)) {
    if (value > 62) return 'danger';
    if (value > 45) return 'warn';
    return 'good';
  }
  if (value > 60) return 'good';
  if (value > 38) return 'warn';
  return 'danger';
}

function renderCityStats(changes = {}) {
  const stats = currentState.city_stats;
  const container = el('city-stats-rows');
  container.innerHTML = '';
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const val = stats[key] ?? 50;
    const delta = changes[key] ?? 0;
    const color = statColor(key, val);
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-label">${label}</span>
      <div class="stat-track"><div class="stat-fill ${color}" style="width:${val}%"></div></div>
      <span class="stat-value">${Math.round(val)}</span>
      <span class="stat-delta ${delta > 0.04 ? 'pos' : delta < -0.04 ? 'neg' : ''}">
        ${delta > 0.04 ? '+' + delta.toFixed(1) : delta < -0.04 ? delta.toFixed(1) : ''}
      </span>`;
    container.appendChild(row);
  }
}

// ── Groups ─────────────────────────────────────────────────────────────────
function renderGroups() {
  const metrics = currentState.group_metrics || {};
  const container = el('groups-container');
  container.innerHTML = '';
  for (const [gid, m] of Object.entries(metrics)) {
    const info = identityGroups[gid] || {};
    const name = info.name || gid;
    const pop  = info.population_percent ? Math.round(info.population_percent * 100) : '?';
    const align = m.alignment;
    const alignClass = align > 10 ? 'align-mayor' : align < -10 ? 'align-opp' : 'align-neutral';
    const alignText  = align > 10 ? `+${align.toFixed(1)} Mayor` : align < -10 ? `${align.toFixed(1)} Opp` : 'Neutral';
    const radColor = m.radicalization > 60 ? '#ef4444' : m.radicalization > 40 ? '#eab308' : '#22c55e';
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-name">${name}</div>
      <div class="group-sub">${pop}% population · ${info.religion || ''}</div>
      <div class="group-metrics">
        <div class="group-metric"><span class="group-metric-label">Happiness</span><span class="group-metric-value">${m.happiness.toFixed(1)}</span></div>
        <div class="group-metric"><span class="group-metric-label">Radical</span><span class="group-metric-value" style="color:${radColor}">${m.radicalization.toFixed(1)}</span></div>
        <div class="group-metric"><span class="group-metric-label">Alignment</span><span class="group-metric-value ${alignClass}">${alignText}</span></div>
      </div>`;
    container.appendChild(card);
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
function renderEvents(turnResult = null) {
  const container = el('events-container');
  container.innerHTML = '';
  const active = currentState.active_events || [];
  const generatedName = turnResult?.generated_event?.name;

  if (active.length === 0) {
    container.innerHTML = '<div class="no-events">No active crises</div>';
  } else {
    for (const ev of active) {
      const isGenerated = ev.id && ev.id.startsWith('llm_');
      const item = document.createElement('div');
      item.className = 'event-item' + (isGenerated ? ' generated' : '');
      item.innerHTML = `
        <div class="event-icon">⚠</div>
        <div>
          <div class="event-name">${ev.name}${isGenerated ? ' <span style="color:var(--gold);font-size:10px">AI-generated</span>' : ''}</div>
          <div class="event-meta">Escalation ${ev.escalation_level}/${ev.max_escalation} · ${ev.remaining_turns} turn${ev.remaining_turns !== 1 ? 's' : ''} remaining</div>
          ${isGenerated && turnResult?.generated_event?.description ? `<div class="event-meta" style="margin-top:4px;color:var(--text)">${turnResult.generated_event.description}</div>` : ''}
        </div>`;
      container.appendChild(item);
    }
  }

  const risksEl = el('crisis-risks');
  if (turnResult?.event_chances && Object.keys(turnResult.event_chances).length > 0) {
    const [topName, topChance] = Object.entries(turnResult.event_chances).sort((a, b) => b[1] - a[1])[0];
    const label = topName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    risksEl.innerHTML = `Next turn risk: <strong>${label} ${(topChance * 100).toFixed(1)}%</strong>`;
  } else {
    risksEl.textContent = '';
  }
}

// ── Citizen debates ────────────────────────────────────────────────────────
function renderDebates(debateResults) {
  if (!debateResults || debateResults.length === 0) {
    hideDebates();
    return;
  }
  const container = el('debates-container');
  container.innerHTML = '';
  el('debates-panel').style.display = 'block';

  for (const dr of debateResults) {
    const card = document.createElement('div');
    card.className = 'debate-card';

    const deltas = [
      { label: 'Align', val: dr.alignment_delta },
      { label: 'Morale', val: dr.happiness_delta },
      { label: 'Radical', val: dr.radicalization_delta },
      { label: 'Trust', val: dr.trust_delta },
    ];
    const deltasHtml = deltas
      .filter(d => Math.abs(d.val) >= 0.1)
      .map(d => {
        const cls = d.val > 0 ? 'pos' : 'neg';
        const sign = d.val > 0 ? '+' : '';
        return `<div class="debate-delta">${d.label}: <span class="${cls}">${sign}${d.val.toFixed(1)}</span></div>`;
      }).join('');

    card.innerHTML = `
      <div class="debate-group-name">${dr.group_name}</div>
      <div class="debate-summary">${dr.debate_summary}</div>
      ${dr.notable_quote ? `<div class="debate-quote">"${dr.notable_quote}"</div>` : ''}
      ${deltasHtml ? `<div class="debate-deltas">${deltasHtml}</div>` : ''}`;
    container.appendChild(card);
  }
}

function hideDebates() {
  const panel = el('debates-panel');
  if (panel) panel.style.display = 'none';
}

// ── Policy cards ───────────────────────────────────────────────────────────
function renderPolicies() {
  const grid = el('policy-grid');
  grid.innerHTML = '';
  const gameOver = currentState.turn_number >= currentState.total_turns;

  if (gameOver) {
    el('policy-prompt').innerHTML = 'The simulation has ended.';
    return;
  }

  const nextTurn = currentState.turn_number + 1;
  el('policy-prompt').innerHTML = `<strong>Turn ${nextTurn}</strong> — Choose your action as Mayor:`;

  for (const p of mayorPolicies) {
    const card = document.createElement('div');
    card.className = 'policy-card' + (awaitingTurn ? ' disabled' : '');
    card.dataset.id = p.id;
    card.onclick = () => selectPolicy(p.id);

    const effects = Object.entries(p.effects || {})
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 3);

    const effectsHtml = effects.map(([k, v]) => {
      const label = STAT_LABELS[k] || k;
      const cls = v > 0 ? 'pos' : 'neg';
      const sign = v > 0 ? '+' : '';
      return `<div class="policy-effect"><span>${label}</span><span class="policy-effect-val ${cls}">${sign}${v.toFixed(1)}</span></div>`;
    }).join('');

    const groupImpacts = (p.group_effects || []).map(ge => {
      const who = Object.values(ge.match || {})[0] || 'All';
      const parts = [];
      if (ge.happiness > 0)      parts.push(`<span class="happy">↑ ${who}</span>`);
      if (ge.happiness < 0)      parts.push(`<span class="angry">↓ ${who}</span>`);
      if (ge.radicalization > 0) parts.push(`<span class="angry">rad↑ ${who}</span>`);
      return parts.join(' ');
    }).filter(Boolean).join(' ');

    const rationaleHtml = p.rationale
      ? `<div class="policy-card-rationale">💡 ${p.rationale}</div>` : '';

    card.innerHTML = `
      ${rationaleHtml}
      <div class="policy-card-name">${p.name}</div>
      ${p.description ? `<div class="policy-card-desc">${p.description}</div>` : ''}
      <div class="policy-effects">${effectsHtml}</div>
      ${groupImpacts ? `<div class="policy-groups">${groupImpacts}</div>` : ''}`;
    grid.appendChild(card);
  }
}

// ── Turn result banner ─────────────────────────────────────────────────────
function showTurnResult(result) {
  el('result-mayor-action').textContent = result.mayor_action?.name || '—';
  el('result-opp-action').textContent   = result.opposition_action?.name || '—';

  const eventsEl = el('result-events');
  const triggered = result.triggered_events || [];
  if (triggered.length > 0) {
    eventsEl.innerHTML = triggered.map(e => `<span>⚠ ${e}</span>`).join('');
    eventsEl.style.display = 'block';
  } else {
    eventsEl.style.display = 'none';
  }

  // Show opposition rationale if available
  const oppRationale = result.opposition_action?.rationale;
  const rationaleEl = el('result-opp-rationale');
  if (rationaleEl) {
    rationaleEl.textContent = oppRationale || '';
    rationaleEl.style.display = oppRationale ? 'block' : 'none';
  }

  el('turn-result').classList.add('visible');
}

function hideTurnResult() {
  el('turn-result').classList.remove('visible');
}

// ── Turn log ───────────────────────────────────────────────────────────────
function renderLog() {
  const logEl = el('turn-log');
  const policies = currentState.policy_history || [];
  const events   = currentState.event_history   || [];
  const all = [
    ...policies.map(l => ({ text: l, isEvent: false })),
    ...events.map(l =>   ({ text: l, isEvent: true  })),
  ].reverse();
  logEl.innerHTML = all.map(({ text, isEvent }) => {
    const safe = text.replace(/</g, '&lt;');
    const colored = safe
      .replace(/(mayor)/gi, '<span class="mayor-tag">$1</span>')
      .replace(/(opposition)/gi, '<span class="opp-tag">$1</span>');
    return `<div class="log-line ${isEvent ? 'event-line' : ''}">${colored}</div>`;
  }).join('');
}

// ── Election overlay ───────────────────────────────────────────────────────
function showElectionOverlay(result) {
  el('election-mayor-pct').textContent = result.mayor_vote_share.toFixed(1) + '%';
  el('election-opp-pct').textContent   = result.opposition_vote_share.toFixed(1) + '%';
  el('election-outcome').textContent   = result.outcome;

  const outcomeEl = el('election-outcome');
  outcomeEl.className = 'outcome';
  if (result.mayor_vote_share > result.opposition_vote_share) outcomeEl.classList.add('mayor-win');
  else if (result.opposition_vote_share > result.mayor_vote_share) outcomeEl.classList.add('opp-win');
  else outcomeEl.classList.add('hung');

  el('election-meta').textContent =
    `Undecided: ${(result.undecided_bloc * 100).toFixed(1)}%  ·  Swing voters: ${(result.swing_voters * 100).toFixed(1)}%`;

  setTimeout(() => {
    setFillWidth('election-fill-mayor', result.mayor_vote_share);
    setFillWidth('election-fill-opp',   result.opposition_vote_share);
  }, 200);

  el('election-overlay').classList.add('visible');
}

function hideElectionOverlay() {
  el('election-overlay').classList.remove('visible');
  setFillWidth('election-fill-mayor', 0);
  setFillWidth('election-fill-opp', 0);
}

async function continueAfterElection() {
  hideElectionOverlay();
  if (currentState.turn_number >= currentState.total_turns) {
    showGameOverOverlay();
  }
}

// ── Game over overlay ──────────────────────────────────────────────────────
function showGameOverOverlay() {
  const s = currentState;
  el('gameover-party').textContent    = s.governing_party;
  el('gameover-mayor-pop').textContent = s.mayor_popularity.toFixed(1) + '%';
  el('gameover-opp-pop').textContent   = s.opposition_popularity.toFixed(1) + '%';
  el('gameover-overlay').classList.add('visible');
}

function hideGameOverOverlay() {
  el('gameover-overlay').classList.remove('visible');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function setFillWidth(id, pct) {
  const e = el(id);
  if (e) e.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function setCardsDisabled(disabled) {
  document.querySelectorAll('.policy-card').forEach(c => c.classList.toggle('disabled', disabled));
}

function highlightCard(policyId) {
  document.querySelectorAll('.policy-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === policyId);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
