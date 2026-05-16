const ACTION_ICONS = {
  idle: '☕', walking: '🚶', chopping_wood: '🪓', watering_crops: '💧', harvesting: '🌾', eating: '🍞',
  sleeping: '😴', running_to_shelter: '🏃', sitting: '🧘', praying: '🙏', fishing: '🎣',
  tending_animals: '🐄', checking_motorcycle: '🏍️', wandering: '🌿', tending_crops: '🌱',
  morning_garden: '🌱', checking_herbs: '🌿', village_errand: '🧺', resting: '🧘', animal_care: '🐐',
  neighbor_walk: '🚶', evening_prayer: '🙏', watering_garden: '💧', shared_path_garden: '🌼'
};

const ACTION_LABELS = {
  idle: 'Free Time', walking: 'Walking', chopping_wood: 'Chopping Wood', watering_crops: 'Watering Crops',
  harvesting: 'Harvesting', eating: 'Eating', sleeping: 'Sleeping', running_to_shelter: 'Running to Shelter',
  sitting: 'Resting', praying: 'Praying', fishing: 'Fishing', tending_animals: 'Tending Animals',
  checking_motorcycle: 'Checking Motorcycle', wandering: 'Wandering the Farm', tending_crops: 'Tending Crops',
  morning_garden: 'Morning Garden Care', checking_herbs: 'Checking Herbs', village_errand: 'Village Errand',
  resting: 'Quiet Rest', animal_care: 'Animal Care', neighbor_walk: 'Neighbor Walk', evening_prayer: 'Evening Prayer',
  watering_garden: 'Watering Garden', shared_path_garden: 'Shared Path Garden Work'
};

const WEATHER_ICONS = { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', foggy: '🌫️', windy: '💨', stormy: '⛈️' };
const MOOD_ICONS = { happy: '😄', content: '😊', tired: '😴', hungry: '😫', peaceful: '😌', worried: '😟', focused: '🧐', proud: '😎', curious: '🤔' };

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setHtml(el, html, fallback = '') { if (el) el.innerHTML = html || fallback; }
function createMetric(label, value, tone = 'primary') { return `<div class="metric-pill metric-pill--${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function createMeter(label, value, tone = 'primary') { const safe = pct(value); return `<div class="world-meter world-meter--${tone}"><div class="world-meter-head"><span>${esc(label)}</span><strong>${safe}%</strong></div><div class="world-meter-track"><div class="world-meter-fill" style="width:${safe}%"></div></div></div>`; }
function goalMarkup(goal) { const steps = goal.steps || []; const done = steps.filter(step => step.done).length; const total = Math.max(steps.length, 1); return `<article class="goal-row goal-row--${goal.status === 'done' ? 'done' : 'open'}"><div><strong>${esc(goal.title)}</strong><span>${esc(goal.reason || '')}</span></div><em>${done}/${total}</em></article>`; }
function skillMarkup(name, skill = {}) { return `<div class="skill-row"><span>${esc(name)}</span><strong>L${skill.level || 1}</strong><em>${skill.xp || 0} XP</em></div>`; }
function eventMarkup(event = {}) { return `<article class="event-row"><strong>${esc(event.title || 'Event')}</strong><span>${esc(event.note || '')}</span></article>`; }
function riskMarkup(risk = {}) { const top = risk.topRisk; if (!top) return '<div class="muted-empty">No active risk.</div>'; const tone = risk.mode === 'critical' || risk.mode === 'urgent' ? 'warn' : 'ready'; return `<div class="risk-card risk-card--${tone}"><strong>${esc(top.label || risk.mode)}</strong><span>${esc(top.reason || risk.summary || '')}</span>${createMeter('Severity', risk.overall || top.severity || 0, tone)}</div>`; }

export class HUD {
  constructor() {
    this.$day = document.getElementById('stat-day');
    this.$time = document.getElementById('stat-time');
    this.$weather = document.getElementById('stat-weather');
    this.$mood = document.getElementById('stat-mood');
    this.$energyBar = document.getElementById('energy-bar');
    this.$energyVal = document.getElementById('energy-val');
    this.$hungerBar = document.getElementById('hunger-bar');
    this.$hungerVal = document.getElementById('hunger-val');
    this.$taskIcon = document.getElementById('task-icon');
    this.$taskLabel = document.getElementById('task-label');
    this.$taskContext = document.getElementById('task-context');
    this.$taskSource = document.getElementById('task-source-chip');
    this.$thought = document.getElementById('thought-bubble');
    this.$thoughtText = document.getElementById('thought-text');
    this.$aidaMood = document.getElementById('aida-stat-mood');
    this.$aidaEnergyBar = document.getElementById('aida-energy-bar');
    this.$aidaEnergyVal = document.getElementById('aida-energy-val');
    this.$aidaHungerBar = document.getElementById('aida-hunger-bar');
    this.$aidaHungerVal = document.getElementById('aida-hunger-val');
    this.$aidaTaskIcon = document.getElementById('aida-task-icon');
    this.$aidaTaskLabel = document.getElementById('aida-task-label');
    this.$aidaTaskContext = document.getElementById('aida-task-context');
    this.$aidaTaskSource = document.getElementById('aida-task-source-chip');
    this.$aidaThought = document.getElementById('aida-thought-bubble');
    this.$aidaThoughtText = document.getElementById('aida-thought-text');
    this.$aidaGoals = document.getElementById('aida-daily-goals-list');
    this.$aidaRiskPill = document.getElementById('aida-risk-pill');
    this.$aidaRiskDetail = document.getElementById('aida-risk-detail');
    this.$aidaSkills = document.getElementById('aida-skills-list');
    this.$aidaWorld = document.getElementById('aida-world-state-list');
    this.$aidaMemories = document.getElementById('aida-memory-list');
    this.$aidaEvents = document.getElementById('aida-events-list');
    this.$aidaIntentPanel = document.getElementById('aida-intent-panel');
    this.$aidaIntentToggle = document.getElementById('aida-intent-toggle');
    this.$relationshipDialogue = document.getElementById('arash-aida-dialogue');
    this.$relationshipPill = document.getElementById('arash-aida-pill');
    this.$tabArash = document.getElementById('dashboard-tab-arash');
    this.$tabAida = document.getElementById('dashboard-tab-aida');
    this.$characterPanels = [...document.querySelectorAll('[data-character-panel]')];
    this.$goals = document.getElementById('daily-goals-list');
    this.$riskPill = document.getElementById('risk-pill');
    this.$riskDetail = document.getElementById('risk-detail');
    this.$skills = document.getElementById('skills-list');
    this.$world = document.getElementById('world-state-list');
    this.$memories = document.getElementById('memory-list');
    this.$events = document.getElementById('events-list');
    this.$schedule = document.getElementById('schedule-list');
    this.$conn = document.getElementById('conn-status');
    this.$dashboard = document.getElementById('dashboard');
    this.$dashboardToggle = document.getElementById('dashboard-toggle');
    this.$intentPanel = document.getElementById('intent-panel');
    this.$intentToggle = document.getElementById('intent-toggle');
    this._dayCount = 1;
    this._lastHour = -1;
    this._selectedCharacter = 'arash';
    this.initDashboardToggle();
    this.initIntentToggle();
    this.initCharacterTabs();
  }

  initDashboardToggle() {
    if (!this.$dashboard || !this.$dashboardToggle) return;
    this.$dashboardToggle.addEventListener('click', () => {
      const collapsed = this.$dashboard.classList.toggle('is-collapsed');
      this.$dashboardToggle.textContent = collapsed ? '+' : '−';
      this.$dashboardToggle.title = collapsed ? 'Expand console' : 'Minimize console';
    });
  }

  initIntentToggle() {
    if (this.$intentPanel && this.$intentToggle) {
      this.$intentToggle.addEventListener('click', () => {
        const collapsed = this.$intentPanel.classList.toggle('is-collapsed');
        this.$intentToggle.textContent = collapsed ? '+' : '−';
        this.$intentToggle.title = collapsed ? 'Expand intent' : 'Minimize intent';
      });
    }
    if (this.$aidaIntentPanel && this.$aidaIntentToggle) {
      this.$aidaIntentToggle.addEventListener('click', () => {
        const collapsed = this.$aidaIntentPanel.classList.toggle('is-collapsed');
        this.$aidaIntentToggle.textContent = collapsed ? '+' : '−';
        this.$aidaIntentToggle.title = collapsed ? 'Expand intent' : 'Minimize intent';
      });
    }
  }

  initCharacterTabs() {
    this.$tabArash?.addEventListener('click', () => this.setCharacterPanel('arash'));
    this.$tabAida?.addEventListener('click', () => this.setCharacterPanel('aida'));
    this.setCharacterPanel(this._selectedCharacter);
  }

  setCharacterPanel(name) {
    this._selectedCharacter = name === 'aida' ? 'aida' : 'arash';
    this.$tabArash?.classList.toggle('active', this._selectedCharacter === 'arash');
    this.$tabAida?.classList.toggle('active', this._selectedCharacter === 'aida');
    this.$characterPanels.forEach(panel => {
      panel.classList.toggle('is-hidden', panel.dataset.characterPanel !== this._selectedCharacter);
    });
  }

  setTime(timeStr, hour) {
    if (this.$time) this.$time.textContent = timeStr;
    if (this._lastHour !== -1 && this._lastHour > 20 && hour === 0) this._dayCount++;
    this._lastHour = hour;
    if (this.$day) this.$day.textContent = `Day ${this._dayCount}`;
  }

  update(data) {
    const energy = data.energy ?? 0;
    const hunger = data.hunger ?? 0;
    if (data.day > 0) this._dayCount = data.day;
    if (this.$day) this.$day.textContent = `Day ${this._dayCount}`;
    if (this.$energyBar) { this.$energyBar.style.width = `${energy}%`; this.$energyBar.style.background = energy > 40 ? '#31d27c' : energy > 20 ? '#f1c84b' : '#ef6a6a'; }
    if (this.$energyVal) this.$energyVal.textContent = `${energy}%`;
    if (this.$hungerBar) { this.$hungerBar.style.width = `${hunger}%`; this.$hungerBar.style.background = hunger < 50 ? '#31d27c' : hunger < 75 ? '#f1c84b' : '#ef6a6a'; }
    if (this.$hungerVal) this.$hungerVal.textContent = `${hunger}%`;
    if (this.$weather && data.weather) this.$weather.textContent = `${WEATHER_ICONS[data.weather] || '🌤️'} ${data.weather}`;
    if (this.$mood && data.mood) this.$mood.textContent = `${MOOD_ICONS[data.mood] || '😊'} ${data.mood}`;

    const icon = ACTION_ICONS[data.current_action] || '❓';
    const label = data.active_task_label || ACTION_LABELS[data.current_action] || data.current_action || 'Idle';
    if (this.$taskIcon) this.$taskIcon.textContent = icon;
    if (this.$taskLabel) this.$taskLabel.textContent = label;
    if (this.$taskSource) this.$taskSource.textContent = data.active_task_source || 'steady';
    if (this.$taskContext) { const parts = [data.active_goal_title, data.active_task_reason, data.active_risk_id ? `risk: ${data.active_risk_id}` : null].filter(Boolean); this.$taskContext.textContent = parts.join(' | ') || 'Waiting for the next meaningful action.'; }
    if (this.$thoughtText) this.$thoughtText.textContent = data.thought || 'Arash is observing the world.';
    if (this.$thought) this.$thought.classList.toggle('is-live', Boolean(data.thought));

    this.updateAida(data.ida_state);
    this.updateRelationshipConsole(data, data.ida_state);

    const goals = data.daily_plan?.goals || [];
    setHtml(this.$goals, goals.length ? goals.slice(0, 5).map(goalMarkup).join('') : '<div class="muted-empty">Daily goals will appear here.</div>');
    const risk = data.risk_state || {};
    if (this.$riskPill) this.$riskPill.textContent = risk.mode || 'stable';
    setHtml(this.$riskDetail, riskMarkup(risk));
    const skills = data.skills || {};
    setHtml(this.$skills, [skillMarkup('Farming', skills.farming), skillMarkup('Animals', skills.animals), skillMarkup('Repair', skills.repair), skillMarkup('Cooking', skills.cooking), skillMarkup('Survival', skills.survival)].join(''));
    this.updateWorld(data.world_state || {});

    if (this.$memories) {
      this.$memories.innerHTML = '';
      (data.memories || []).slice(0, 5).forEach(memory => { const li = document.createElement('li'); li.textContent = memory.content || memory; this.$memories.appendChild(li); });
      if (!this.$memories.children.length) this.$memories.innerHTML = '<li class="muted-empty">No memory yet.</li>';
    }
    const events = data.world_events || [];
    setHtml(this.$events, events.length ? events.slice(0, 4).map(eventMarkup).join('') : '<div class="muted-empty">No notable event yet.</div>');
  }

  updateRelationshipConsole(arash = {}, aida = {}) {
    if (!this.$relationshipDialogue) return;
    const bond = pct(aida?.relationship_arash ?? 0);
    const arashAction = arash.active_task_label || ACTION_LABELS[arash.current_action] || arash.current_action || 'observing the farm';
    const aidaAction = aida?.active_task_label || ACTION_LABELS[aida?.current_action] || aida?.current_action || 'settling into village life';
    const tone = bond >= 65 ? 'close' : bond >= 40 ? 'familiar' : 'distant';
    if (this.$relationshipPill) this.$relationshipPill.textContent = tone;
    this.$relationshipDialogue.innerHTML = `
      <div class="dialogue-line"><strong>Arash</strong><span>${esc(arashAction)}</span></div>
      <div class="dialogue-line"><strong>Aida</strong><span>${esc(aidaAction)}</span></div>
      <div class="relationship-meter">${createMeter('Bond', bond, bond >= 55 ? 'ready' : 'primary')}</div>`;
  }

  updateAida(aida = {}) {
    if (!aida || !aida.name) return;

    const energy = pct(aida.energy ?? 0);
    const hunger = pct(aida.hunger ?? 0);
    if (this.$aidaEnergyBar) { this.$aidaEnergyBar.style.width = `${energy}%`; this.$aidaEnergyBar.style.background = energy > 40 ? '#31d27c' : energy > 20 ? '#f1c84b' : '#ef6a6a'; }
    if (this.$aidaEnergyVal) this.$aidaEnergyVal.textContent = `${energy}%`;
    if (this.$aidaHungerBar) { this.$aidaHungerBar.style.width = `${hunger}%`; this.$aidaHungerBar.style.background = hunger < 50 ? '#31d27c' : hunger < 75 ? '#f1c84b' : '#ef6a6a'; }
    if (this.$aidaHungerVal) this.$aidaHungerVal.textContent = `${hunger}%`;
    if (this.$aidaMood && aida.mood) this.$aidaMood.textContent = `${MOOD_ICONS[aida.mood] || '😊'} ${aida.mood}`;

    const action = aida.current_action || 'idle';
    const icon = ACTION_ICONS[action] || '🌿';
    const label = aida.active_task_label || ACTION_LABELS[action] || action || 'Settling in';
    if (this.$aidaTaskIcon) this.$aidaTaskIcon.textContent = icon;
    if (this.$aidaTaskLabel) this.$aidaTaskLabel.textContent = label;
    if (this.$aidaTaskSource) this.$aidaTaskSource.textContent = aida.active_task_source || 'steady';
    if (this.$aidaTaskContext) {
      const parts = [aida.active_goal_title, aida.active_task_reason, aida.active_risk_id ? `risk: ${aida.active_risk_id}` : null].filter(Boolean);
      this.$aidaTaskContext.textContent = parts.join(' | ') || 'Aida is observing her homestead.';
    }
    if (this.$aidaThoughtText) this.$aidaThoughtText.textContent = aida.thought || 'Aida is reading the needs of her home.';
    if (this.$aidaThought) this.$aidaThought.classList.toggle('is-live', Boolean(aida.thought));

    const goals = aida.daily_plan?.goals || [];
    setHtml(this.$aidaGoals, goals.length ? goals.slice(0, 5).map(goalMarkup).join('') : '<div class="muted-empty">Daily goals will appear here.</div>');
    const risk = aida.risk_state || {};
    if (this.$aidaRiskPill) this.$aidaRiskPill.textContent = risk.mode || 'stable';
    setHtml(this.$aidaRiskDetail, riskMarkup(risk));
    
    const skills = aida.skills || {};
    setHtml(this.$aidaSkills, [skillMarkup('Gardening', skills.gardening), skillMarkup('Herbs', skills.herbs), skillMarkup('Animals', skills.animals), skillMarkup('Cooking', skills.cooking), skillMarkup('Social', skills.social), skillMarkup('Resilience', skills.resilience)].join(''));
    
    const world = aida.aida_world || {};
    if (this.$aidaWorld) {
      this.$aidaWorld.innerHTML = `<div class="world-ledger-grid">${createMetric('Food', world.supplies?.food ?? 0)}${createMetric('Herbs', world.supplies?.herbs ?? 0)}${createMetric('Thread', world.supplies?.thread ?? 0)}${createMetric('Herb Stock', world.herbs?.stock ?? 0)}${createMetric('Home Clean', \`\${pct(world.home?.cleanliness)}%\`, pct(world.home?.cleanliness) <= 35 ? 'warn' : 'primary')}</div><div class="field-ledger"><article><strong>Garden</strong>${createMeter('Moisture', world.garden?.moisture, (world.garden?.moisture ?? 100) < 30 ? 'warn' : 'primary')}${createMeter('Growth', world.garden?.growth, (world.garden?.growth ?? 0) > 75 ? 'ready' : 'primary')}${createMeter('Health', world.garden?.health, (world.garden?.health ?? 100) < 45 ? 'warn' : 'primary')}</article><article><strong>Animals</strong>${createMeter('Hunger', world.animals?.hunger, (world.animals?.hunger ?? 0) > 70 ? 'warn' : 'primary')}${createMeter('Trust', world.animals?.trust, 'ready')}</article></div>`;
    }

    if (this.$aidaMemories) {
      this.$aidaMemories.innerHTML = '';
      const memories = aida.short_memory || [];
      memories.slice(0, 5).forEach(m => {
        const li = document.createElement('li');
        li.textContent = m.text || m.content || m;
        this.$aidaMemories.appendChild(li);
      });
      if (!this.$aidaMemories.children.length) this.$aidaMemories.innerHTML = '<li class="muted-empty">No short memory yet.</li>';
    }

    const events = aida.world_events || [];
    setHtml(this.$aidaEvents, events.length ? events.slice(0, 4).map(eventMarkup).join('') : '<div class="muted-empty">No notable event yet.</div>');
  }

  updateWorld(world) {
    if (!this.$world) return;
    const east = world.fields?.east || {}, west = world.fields?.west || {}, storage = world.storage || {}, well = world.well || {}, house = world.house || {}, motorcycle = world.motorcycle || {}, animals = world.animals || {};
    this.$world.innerHTML = `<div class="world-ledger-grid">${createMetric('Food', storage.food ?? 0)}${createMetric('Wood', storage.wood ?? 0)}${createMetric('Seeds', storage.seeds ?? 0)}${createMetric('Well', `${pct(well.water_level)}%`, pct(well.water_level) <= 20 ? 'warn' : 'primary')}${createMetric('House', `${pct(house.condition)}%`, pct(house.condition) <= 45 ? 'warn' : 'primary')}${createMetric('Animals', `${pct(animals.health)}%`, pct(animals.health) <= 55 ? 'warn' : 'primary')}${createMetric('Motor', `${pct(motorcycle.condition)}%`, pct(motorcycle.condition) <= 40 ? 'warn' : 'primary')}${createMetric('Fuel', `${pct(motorcycle.fuel)}%`, pct(motorcycle.fuel) <= 25 ? 'warn' : 'primary')}</div><div class="field-ledger"><article><strong>East Field</strong>${createMeter('Moisture', east.moisture, east.moisture < 30 ? 'warn' : 'primary')}${createMeter('Growth', east.growth, east.growth > 75 ? 'ready' : 'primary')}</article><article><strong>West Field</strong>${createMeter('Moisture', west.moisture, west.moisture < 30 ? 'warn' : 'primary')}${createMeter('Growth', west.growth, west.growth > 75 ? 'ready' : 'primary')}</article></div>`;
  }

  updateSchedule(directives) {
    if (!this.$schedule) return;
    this.$schedule.innerHTML = '';
    if (!directives || directives.length === 0) { this.$schedule.innerHTML = '<li class="schedule-empty">No upcoming items.</li>'; return; }
    [...directives].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 8).forEach(d => {
      const isCreator = d.source === 'creator';
      const li = document.createElement('li');
      li.className = `schedule-item ${isCreator ? 'schedule-item--creator' : 'schedule-item--routine'}`;
      li.innerHTML = `<span class="sched-time">${esc(d.time)}</span><span class="sched-label">${esc(d.label || d.action)}</span><span class="sched-badge">${isCreator ? (d.recurring ? 'daily' : 'once') : 'routine'}</span>${isCreator ? `<button class="sched-del" data-id="${esc(d.id)}" title="Remove">✕</button>` : ''}`;
      if (isCreator) li.querySelector('.sched-del').addEventListener('click', async e => { const id = e.target.dataset.id; const res = await fetch(`/api/directive/${id}`, { method: 'DELETE' }); if (res.ok) li.remove(); });
      this.$schedule.appendChild(li);
    });
  }

  setConnected(connected) { if (this.$conn) { this.$conn.textContent = connected ? '● Live' : '● Reconnecting'; this.$conn.className = `dashboard-chip ${connected ? 'dashboard-chip--live' : 'dashboard-chip--warn'}`; } }
}
