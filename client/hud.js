// hud.js — DOM-based HUD controller
const ACTION_ICONS = {
  idle: '💤', walking: '🚶', chopping_wood: '🪓',
  watering_crops: '💧', harvesting: '🌾', eating: '🍞',
  sleeping: '😴', running_to_shelter: '🏃', sitting: '🧘',
  praying: '🙏', fishing: '🎣', tending_animals: '🐄',
  checking_motorcycle: '🏍️', wandering: '🌿', tending_crops: '🌱'
};

const ACTION_LABELS_FA = {
  idle: 'در حال استراحت',
  walking: 'در حال قدم زدن',
  chopping_wood: 'در حال هیزم شکستن',
  watering_crops: 'در حال آبیاری',
  harvesting: 'در حال برداشت محصول',
  eating: 'در حال خوردن غذا',
  sleeping: 'در حال خواب',
  running_to_shelter: 'در حال فرار به پناهگاه',
  sitting: 'در حال نشستن',
  praying: 'در حال نماز',
  fishing: 'در حال ماهیگیری',
  tending_animals: 'در حال مراقبت از حیوانات',
  checking_motorcycle: 'دارد موتور را نگاه می‌کند',
  wandering: 'در حال گشت در مزرعه',
  tending_crops: 'در حال مراقبت از کشتزار'
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
    this.$time      = document.getElementById('world-time');
    this.$icon      = document.getElementById('world-icon');
    this.$weather   = document.getElementById('weather-badge');
    this.$energyBar = document.getElementById('energy-bar');
    this.$energyVal = document.getElementById('energy-val');
    this.$hungerBar = document.getElementById('hunger-bar');
    this.$hungerVal = document.getElementById('hunger-val');
    this.$actionIcon= document.getElementById('action-icon');
    this.$actionText= document.getElementById('action-text');
    this.$mood      = document.getElementById('char-mood');
    this.$thought   = document.getElementById('thought-bubble');
    this.$thoughtTx = document.getElementById('thought-text');
    this.$memList   = document.getElementById('memory-list');
    this.$conn      = document.getElementById('conn-status');
  }

  setTime(timeStr, hour) {
    if (this.$time) this.$time.textContent = timeStr;
    if (this.$icon) {
      if (hour >= 5 && hour < 8)   this.$icon.textContent = '🌅';
      else if (hour >= 8 && hour < 18) this.$icon.textContent = '☀️';
      else if (hour >= 18 && hour < 21) this.$icon.textContent = '🌆';
      else this.$icon.textContent = '🌙';
    }
  }

  update(data) {
    const { energy, hunger, current_action, weather, mood, thought, memories } = data;

    // Bars
    if (this.$energyBar) this.$energyBar.style.width = `${energy ?? 0}%`;
    if (this.$energyVal) this.$energyVal.textContent  = energy ?? 0;
    if (this.$hungerBar) this.$hungerBar.style.width  = `${hunger ?? 0}%`;
    if (this.$hungerVal) this.$hungerVal.textContent   = hunger ?? 0;

    // Action
    const icon  = ACTION_ICONS[current_action]  || '❓';
    const label = ACTION_LABELS_FA[current_action] || current_action;
    if (this.$actionIcon) this.$actionIcon.textContent = icon;
    if (this.$actionText) this.$actionText.textContent = label;

    // Weather
    if (this.$weather) {
      this.$weather.textContent = `${WEATHER_ICONS[weather] || '🌤️'} ${weather || ''}`;
    }

    // Mood
    if (this.$mood) {
      this.$mood.textContent = `${MOOD_ICONS[mood] || '😊'} ${mood || 'content'}`;
    }

    // Thought bubble
    if (thought && this.$thought && this.$thoughtTx) {
      this.$thoughtTx.textContent = thought;
      this.$thought.classList.remove('hidden');
      clearTimeout(this._thoughtTimer);
      this._thoughtTimer = setTimeout(() => {
        this.$thought.classList.add('hidden');
      }, 12000);
    }

    // Memories
    if (memories && this.$memList) {
      this.$memList.innerHTML = '';
      memories.slice(0, 5).forEach((m) => {
        const li = document.createElement('li');
        li.textContent = m.content;
        this.$memList.prepend(li);
      });
    }
  }

  setConnected(connected) {
    if (!this.$conn) return;
    if (connected) {
      this.$conn.textContent = '⚡ متصل';
      this.$conn.className = 'conn-dot online';
      setTimeout(() => { this.$conn.style.opacity = '0'; }, 3000);
    } else {
      this.$conn.textContent = '⚠️ اتصال قطع شد — در حال اتصال مجدد...';
      this.$conn.className = 'conn-dot offline';
      this.$conn.style.opacity = '1';
    }
  }
}
