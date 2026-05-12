// hud.js - Redesigned HUD matching the AI Villager sample design
const ACTION_ICONS = {
  idle: '☕', walking: '🚶', chopping_wood: '🪓',
  watering_crops: '💧', harvesting: '🌾', eating: '🍞',
  sleeping: '😴', running_to_shelter: '🏃', sitting: '🧘',
  praying: '🙏', fishing: '🎣', tending_animals: '🐄',
  checking_motorcycle: '🏍️', wandering: '🌿', tending_crops: '🌱'
};

const ACTION_LABELS = {
  idle: 'Free Time',
  walking: 'Walking',
  chopping_wood: 'Chopping Wood',
  watering_crops: 'Watering Crops',
  harvesting: 'Harvesting',
  eating: 'Eating',
  sleeping: 'Sleeping',
  running_to_shelter: 'Running to Shelter',
  sitting: 'Sitting & Thinking',
  praying: 'Praying',
  fishing: 'Fishing',
  tending_animals: 'Tending Animals',
  checking_motorcycle: 'Checking Motorcycle',
  wandering: 'Wandering the Farm',
  tending_crops: 'Tending Crops'
};

const WEATHER_ICONS = {
  sunny: '☀️', cloudy: '⛅', rainy: '🌧️',
  foggy: '🌫️', windy: '💨', stormy: '⛈️'
};

const MOOD_ICONS = {
  happy: '😄', content: '😊', tired: '😴',
  hungry: '😫', peaceful: '😌', worried: '😟',
  focused: '🧐', proud: '😎', curious: '🤔'
};

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function text(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createMeter(label, value, tone = 'primary') {
  const safe = pct(value);
  return `
    <div class="world-meter world-meter--${tone}">
      <div class="world-meter-head"><span>${text(label)}</span><strong>${safe}%</strong></div>
      <div class="world-meter-track"><div class="world-meter-fill" style="width:${safe}%"></div></div>
    </div>
  `;
}

function createStat(label, value) {
  return `<div class="world-stat"><span>${text(label)}</span><strong>${text(value)}</strong></div>`;
}

function createMiniList(items, emptyText) {
  if (!items || !items.length) return `<div class="world-empty">${text(emptyText)}</div>`;
  return `<ul class="schedule-list compact-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function goalLine(goal) {
  const done = (goal.steps || []).filter(s => s.done).length;
  const total = (goal.steps || []).length || 1;
  const status = goal.status === 'done' ? 'done' : `${done}/${total}`;
  return `<strong>${text(status)}</strong> ${text(goal.title)}`;
}

function skillLine(name, skill) {
  return `${text(name)} <strong>L${text(skill?.level || 1)}</strong>`;
}

export class HUD {
  constructor() {
    this.$title = document.getElementById('hud-title');
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
    this.$thought = document.getElementById('thought-bubble');
    this.$thoughtTx = document.getElementById('thought-text');
    this.$schedList = document.getElementById('schedule-list');
    this.$conn = document.getElementById('conn-status');
    this.$memList = document.getElementById('memory-list');
    this.$worldList = document.getElementById('world-state-list');

    this._dayCount = 1;
    this._lastHour = -1;
  }

  setTime(timeStr, hour) {
    if (this.$time) this.$time.textContent = timeStr;
    if (this._lastHour !== -1 && this._lastHour > 20 && hour === 0) this._dayCount++;
    this._lastHour = hour;
    if (this.$day) this.$day.textContent = `Day ${this._dayCount}`;
  }

  update(data) {
    const { energy, hunger, current_action, weather, mood, thought, memories, day, world_state } = data;

    if (day !== undefined && day !== null && day > 0) this._dayCount = day;
    if (this.$day) this.$day.textContent = `Day ${this._dayCount}`;

    const energyPct = energy ?? 0;
    if (this.$energyBar) {
      this.$energyBar.style.width = `${energyPct}%`;
      this.$energyBar.style.background = energyPct > 40
        ? 'linear-gradient(90deg, #4ade80, #22c55e)'
        : energyPct > 20
          ? 'linear-gradient(90deg, #facc15, #f59e0b)'
          : 'linear-gradient(90deg, #f87171, #ef4444)';
    }
    if (this.$energyVal) this.$energyVal.textContent = `${energyPct}%`;

    const hungerPct = hunger ?? 0;
    if (this.$hungerBar) {
      this.$hungerBar.style.width = `${hungerPct}%`;
      this.$hungerBar.style.background = hungerPct < 50
        ? 'linear-gradient(90deg, #4ade80, #22c55e)'
        : hungerPct < 75
          ? 'linear-gradient(90deg, #facc15, #f59e0b)'
          : 'linear-gradient(90deg, #f87171, #ef4444)';
    }
    if (this.$hungerVal) this.$hungerVal.textContent = `${hungerPct}%`;

    if (this.$weather && weather) this.$weather.textContent = `${WEATHER_ICONS[weather] || '🌤️'} ${weather}`;
    if (this.$mood && mood) this.$mood.textContent = `${MOOD_ICONS[mood] || '😊'} ${mood}`;

    const icon = ACTION_ICONS[current_action] || '❓';
    const label = data.active_task_label || ACTION_LABELS[current_action] || current_action || 'idle';
    if (this.$taskIcon) this.$taskIcon.textContent = icon;
    if (this.$taskLabel) this.$taskLabel.textContent = label;

    if (thought && this.$thought && this.$thoughtTx) {
      this.$thoughtTx.textContent = thought;
      this.$thought.classList.remove('hidden');
      clearTimeout(this._thoughtTimer);
      this._thoughtTimer = setTimeout(() => this.$thought.classList.add('hidden'), 14000);
    }

    if (memories && this.$memList) {
      this.$memList.innerHTML = '';
      memories.slice(0, 6).forEach(m => {
        const li = document.createElement('li');
        li.textContent = m.content;
        this.$memList.appendChild(li);
      });
    }

    if (world_state) this.updateWorldState(data);
  }

  updateWorldState(data) {
    const world = data.world_state;
    if (!this.$worldList || !world) return;
    const east = world.fields?.east || {};
    const west = world.fields?.west || {};
    const storage = world.storage || {};
    const well = world.well || {};
    const house = world.house || {};
    const motorcycle = world.motorcycle || {};
    const animals = world.animals || {};
    const risk = data.risk_state || {};
    const goals = data.daily_plan?.goals || [];
    const skills = data.skills || {};
    const events = data.world_events || [];

    const riskTone = risk.mode === 'critical' || risk.mode === 'urgent' ? 'warn' : risk.mode === 'watching' ? 'ready' : 'primary';
    const goalItems = goals.slice(0, 4).map(goalLine);
    const skillItems = [
      skillLine('Farming', skills.farming),
      skillLine('Animals', skills.animals),
      skillLine('Repair', skills.repair),
      skillLine('Survival', skills.survival)
    ];
    const eventItems = events.slice(0, 3).map(e => `<strong>${text(e.title)}</strong> ${text(e.note)}`);

    this.$worldList.innerHTML = `
      <div class="world-block">
        <div class="world-block-title">Today</div>
        <div class="world-stat"><span>Risk</span><strong>${text(risk.mode || 'stable')}</strong></div>
        ${risk.summary ? `<div class="world-meter world-meter--${riskTone}"><div class="world-meter-head"><span>${text(risk.summary)}</span><strong>${pct(risk.overall)}%</strong></div><div class="world-meter-track"><div class="world-meter-fill" style="width:${pct(risk.overall)}%"></div></div></div>` : ''}
        ${createMiniList(goalItems, 'No daily goals yet')}
      </div>
      <div class="world-block">
        <div class="world-block-title">East Field</div>
        ${createMeter('Moisture', east.moisture, east.moisture < 30 ? 'warn' : 'primary')}
        ${createMeter('Growth', east.growth, east.growth > 75 ? 'ready' : 'primary')}
      </div>
      <div class="world-block">
        <div class="world-block-title">West Field</div>
        ${createMeter('Moisture', west.moisture, west.moisture < 30 ? 'warn' : 'primary')}
        ${createMeter('Growth', west.growth, west.growth > 75 ? 'ready' : 'primary')}
      </div>
      <div class="world-grid">
        ${createStat('Food', storage.food ?? 0)}
        ${createStat('Wood', storage.wood ?? 0)}
        ${createStat('Seeds', storage.seeds ?? 0)}
        ${createStat('Well', `${pct(well.water_level)}%`)}
        ${createStat('House', `${pct(house.condition)}%`)}
        ${createStat('Motor', `${pct(motorcycle.condition)}%`)}
        ${createStat('Fuel', `${pct(motorcycle.fuel)}%`)}
        ${createStat('Animals', `${pct(animals.health)}%`)}
      </div>
      <div class="world-block">
        <div class="world-block-title">Skills</div>
        ${createMiniList(skillItems, 'No skill progress yet')}
      </div>
      <div class="world-block">
        <div class="world-block-title">Recent Events</div>
        ${createMiniList(eventItems, 'No notable event yet')}
      </div>
    `;
  }

  updateSchedule(directives) {
    if (!this.$schedList) return;
    this.$schedList.innerHTML = '';

    if (!directives || directives.length === 0) {
      const li = document.createElement('li');
      li.className = 'schedule-empty';
      li.textContent = 'Loading today\'s schedule...';
      this.$schedList.appendChild(li);
      return;
    }

    const sorted = [...directives].sort((a, b) => a.time.localeCompare(b.time));
    sorted.forEach(d => {
      const isCreator = d.source === 'creator';
      const li = document.createElement('li');
      li.className = `schedule-item ${isCreator ? 'schedule-item--creator' : 'schedule-item--routine'}`;
      const sourceIcon = isCreator ? '👑' : '🤖';
      const badge = isCreator
        ? `${d.recurring ? '<span class="sched-badge">daily</span>' : '<span class="sched-badge sched-badge--once">once</span>'}`
        : '<span class="sched-source-icon">routine</span>';
      li.innerHTML = `
        <span class="sched-source-icon">${sourceIcon}</span>
        <span class="sched-time">${text(d.time)}</span>
        <span class="sched-label">${text(d.label || d.action)}</span>
        ${badge}
        ${isCreator ? `<button class="sched-del" data-id="${text(d.id)}" title="Remove">✕</button>` : ''}
      `;

      if (isCreator) {
        li.querySelector('.sched-del').addEventListener('click', async e => {
          const id = e.target.dataset.id;
          const res = await fetch(`/api/directive/${id}`, { method: 'DELETE' });
          if (res.ok) li.remove();
        });
      }
      this.$schedList.appendChild(li);
    });
  }

  setConnected(connected) {
    if (!this.$conn) return;
    if (connected) {
      this.$conn.textContent = '● Connected';
      this.$conn.className = 'conn-dot online';
      setTimeout(() => { this.$conn.style.opacity = '0'; }, 3000);
    } else {
      this.$conn.textContent = '● Reconnecting...';
      this.$conn.className = 'conn-dot offline';
      this.$conn.style.opacity = '1';
    }
  }
}
