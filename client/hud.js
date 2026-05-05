// hud.js — Redesigned HUD matching the AI Villager sample design
const ACTION_ICONS = {
  idle: '💤', walking: '🚶', chopping_wood: '🪓',
  watering_crops: '💧', harvesting: '🌾', eating: '🍞',
  sleeping: '😴', running_to_shelter: '🏃', sitting: '🧘',
  praying: '🙏', fishing: '🎣', tending_animals: '🐄',
  checking_motorcycle: '🏍️', wandering: '🌿', tending_crops: '🌱'
};

const ACTION_LABELS = {
  idle: 'Resting',
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

export class HUD {
  constructor() {
    this.$title      = document.getElementById('hud-title');
    this.$day        = document.getElementById('stat-day');
    this.$time       = document.getElementById('stat-time');
    this.$weather    = document.getElementById('stat-weather');
    this.$mood       = document.getElementById('stat-mood');
    this.$energyBar  = document.getElementById('energy-bar');
    this.$energyVal  = document.getElementById('energy-val');
    this.$hungerBar  = document.getElementById('hunger-bar');
    this.$hungerVal  = document.getElementById('hunger-val');
    this.$taskIcon   = document.getElementById('task-icon');
    this.$taskLabel  = document.getElementById('task-label');
    this.$thought    = document.getElementById('thought-bubble');
    this.$thoughtTx  = document.getElementById('thought-text');
    this.$schedList  = document.getElementById('schedule-list');
    this.$conn       = document.getElementById('conn-status');
    this.$memList    = document.getElementById('memory-list');

    this._dayCount   = 1;
    this._startHour  = 6;
  }

  setTime(timeStr, hour) {
    if (this.$time) this.$time.textContent = timeStr;
    // Day tracker: each complete cycle past midnight = new day
    if (hour === 0) this._dayCount++;
    if (this.$day) this.$day.textContent = `Day ${this._dayCount}`;
  }

  update(data) {
    const { energy, hunger, current_action, weather, mood, thought, memories } = data;

    // Energy bar
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

    // Hunger bar (high hunger = bad)
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

    // Weather
    if (this.$weather && weather) {
      this.$weather.textContent = `${WEATHER_ICONS[weather] || '🌤️'} ${weather}`;
    }

    // Mood
    if (this.$mood && mood) {
      this.$mood.textContent = `${MOOD_ICONS[mood] || '😊'} ${mood}`;
    }

    // Current task
    const icon  = ACTION_ICONS[current_action]  || '❓';
    const label = ACTION_LABELS[current_action] || current_action || 'idle';
    if (this.$taskIcon)  this.$taskIcon.textContent  = icon;
    if (this.$taskLabel) this.$taskLabel.textContent = label;

    // Thought bubble
    if (thought && this.$thought && this.$thoughtTx) {
      this.$thoughtTx.textContent = thought;
      this.$thought.classList.remove('hidden');
      clearTimeout(this._thoughtTimer);
      this._thoughtTimer = setTimeout(() => {
        this.$thought.classList.add('hidden');
      }, 14000);
    }

    // Memories
    if (memories && this.$memList) {
      this.$memList.innerHTML = '';
      memories.slice(0, 6).forEach(m => {
        const li = document.createElement('li');
        li.textContent = m.content;
        this.$memList.appendChild(li);
      });
    }
  }

  // Update the upcoming schedule panel
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

    // Sort by time
    const sorted = [...directives].sort((a, b) => a.time.localeCompare(b.time));
    sorted.forEach(d => {
      const isCreator = d.source === 'creator';
      const li = document.createElement('li');
      li.className = `schedule-item ${isCreator ? 'schedule-item--creator' : 'schedule-item--routine'}`;

      const sourceIcon = isCreator ? '👑' : '🤖';
      const badge = isCreator
        ? `${d.recurring ? '<span class="sched-badge">daily</span>' : '<span class="sched-badge sched-badge--once">once</span>'}`
        : `<span class="sched-source-icon">routine</span>`;

      li.innerHTML = `
        <span class="sched-source-icon">${sourceIcon}</span>
        <span class="sched-time">${d.time}</span>
        <span class="sched-label">${d.label || d.action}</span>
        ${badge}
        ${isCreator ? `<button class="sched-del" data-id="${d.id}" title="Remove">✕</button>` : ''}
      `;

      // Delete button only for Creator directives
      if (isCreator) {
        li.querySelector('.sched-del').addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          await fetch(`/api/directive/${id}`, { method: 'DELETE' });
          li.remove();
          if (this.$schedList.querySelectorAll('.schedule-item--creator').length === 0) {
            // Routine items remain, no need to show empty state
          }
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
