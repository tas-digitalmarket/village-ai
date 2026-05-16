import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════════
// PERSIAN ACTION MAPS
// ═══════════════════════════════════════════════════════════════════════════════

const ARASH_ACTION_TEXT = {
  idle:               'فعلاً دارم اطرافم را نگاه می‌کنم.',
  walking:            'دارم قدم می‌زنم.',
  sitting:            'نشستم و کمی استراحت می‌کنم.',
  eating:             'دارم غذا می‌خورم.',
  sleeping:           'خوابیده‌ام.',
  watering_crops:     'دارم به مزرعه آب می‌دهم.',
  harvesting:         'دارم محصول برداشت می‌کنم.',
  chopping_wood:      'دارم هیزم خرد می‌کنم.',
  tending_crops:      'دارم به محصول‌ها رسیدگی می‌کنم.',
  tending_animals:    'دارم به حیوانات رسیدگی می‌کنم.',
  fishing:            'دارم ماهیگیری می‌کنم.',
  checking_motorcycle:'دارم موتور را بررسی می‌کنم.',
  wandering:          'دارم کمی در مزرعه قدم می‌زنم.',
  running_to_shelter: 'هوا خطرناک است؛ دارم به خانه برمی‌گردم.',
  praying:            'دارم دعا می‌کنم.',
  resting:            'دارم کمی استراحت می‌کنم.',
};

const AIDA_ACTION_TEXT = {
  idle:               'فعلاً در خانه‌ام آرام هستم.',
  walking:            'دارم به سمت مقصد می‌روم.',
  sitting:            'نشسته‌ام و کمی فکر می‌کنم.',
  resting:            'کمی استراحت می‌کنم.',
  eating:             'دارم غذا می‌خورم.',
  sleeping:           'خوابیده‌ام.',
  morning_garden:     'دارم به باغچه صبحگاهی‌ام رسیدگی می‌کنم.',
  checking_herbs:     'دارم گیاهان دارویی را بررسی می‌کنم.',
  watering_garden:    'دارم باغچه را آب می‌دهم.',
  watering_crops:     'دارم باغچه را آب می‌دهم.',
  animal_care:        'دارم به حیوانات رسیدگی می‌کنم.',
  tending_animals:    'دارم به حیوانات سر می‌زنم.',
  tending_crops:      'دارم به گیاهان رسیدگی می‌کنم.',
  village_errand:     'برای کاری به میدان روستا می‌روم.',
  evening_prayer:     'در آرامش شب دعا می‌کنم.',
  shared_path_garden: 'دارم کنار مسیر مشترک باغچه را مرتب می‌کنم.',
  neighbor_walk:      'دارم کنار خانه همسایه قدم می‌زنم.',
  wandering:          'دارم اطراف خانه‌ام قدم می‌زنم.',
  running_to_shelter: 'هوا بد است؛ دارم برمی‌گردم خانه.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// DIRTY PHRASE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Phrases that are system/debug text and should never appear in bubbles */
const DIRTY_PATTERNS = [
  /شروع\s+کردم\s+\w/,          // "شروع کردم eating"
  /started\s+\w/i,              // "started walking"
  /Fallback active/i,
  /No specific reason/i,
  /AI provided no reason/i,
  /Keep character/i,
  /^[a-z_]+$/,                  // bare action ID like "eating" or "watering_crops"
  /Aida started/i,
  /Arash started/i,
  /completed.*at\s+\d/i,        // "completed X at 08:00"
  /\bstarted\b/i,
  /\bfinished\b/i,
];

function isDirty(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  if (!t || t.length < 3) return true;
  return DIRTY_PATTERNS.some(re => re.test(t));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC FORMATTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a short, natural Persian bubble text for a character.
 *
 * Priority:
 *  1. Clean Persian thought from server (not dirty/system text)
 *  2. Natural action phrase (from map above)
 *  3. Generic fallback
 *
 * @param {'arash'|'aida'} characterName
 * @param {object} state  — character state from WebSocket
 * @returns {string}
 */
export function formatCharacterBubble(characterName, state = {}) {
  const isAida = characterName === 'aida';
  const map    = isAida ? AIDA_ACTION_TEXT : ARASH_ACTION_TEXT;

  // 1. Clean server thought
  const thought = state.thought;
  if (thought && !isDirty(thought)) {
    return clampText(thought);
  }

  // 2. Action phrase
  const action = state.current_action || '';
  if (action && map[action]) {
    return map[action];
  }

  // 3. active_task_label — only if it's proper Persian text
  const label = state.active_task_label || '';
  if (label && !isDirty(label) && /[\u0600-\u06FF]/.test(label)) {
    return clampText(label);
  }

  // 4. Generic fallback
  return isAida ? 'در خانه‌ام آرام هستم.' : 'دارم به مزرعه فکر می‌کنم.';
}

/**
 * Sanitise any text before it goes into a bubble.
 * If it looks dirty/system, replace it with the natural action phrase.
 *
 * @param {string} text
 * @param {'arash'|'aida'} characterName
 * @param {string} action  current_action
 * @returns {string}
 */
export function sanitizeBubbleText(text, characterName, action) {
  if (!isDirty(text)) return clampText(text);
  const map = characterName === 'aida' ? AIDA_ACTION_TEXT : ARASH_ACTION_TEXT;
  return (action && map[action]) || (characterName === 'aida' ? 'در خانه‌ام آرام هستم.' : 'دارم به مزرعه فکر می‌کنم.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const BUBBLE_TTL_MS = 30000;
const MAX_LEN       = 80;

function clampText(value, fallback = '') {
  const text = String(value || fallback).trim();
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPEECH BUBBLE WIDGET
// ═══════════════════════════════════════════════════════════════════════════════

export class CharacterSpeechBubbles {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;
    this.items      = new Map();
    this.tmp        = new THREE.Vector3();
    this._ensureStyles();
  }

  /**
   * Register a character bubble.
   * @param {string} name   character key, e.g. 'arash' or 'aida'
   * @param {object} root   THREE.js root object (for world-position tracking)
   * @param {string} tone   CSS modifier, 'arash' | 'aida'
   */
  add(name, root, tone) {
    const key   = name.toLowerCase();
    const label = key === 'aida' ? 'AIDA' : 'ARASH';
    const el    = document.createElement('div');
    el.className = `overhead-bubble overhead-bubble--${tone}`;
    el.innerHTML = `<strong>${label}</strong><span></span>`;
    document.body.appendChild(el);
    this.items.set(key, { root, el, text: '', visible: true, expiresAt: 0 });
    return el;
  }

  setText(name, text) {
    const item = this.items.get(name.toLowerCase());
    if (!item) return;
    const nextText = clampText(text, '');
    if (!nextText) { item.text = ''; item.expiresAt = 0; return; }
    if (nextText !== item.text) item.expiresAt = Date.now() + BUBBLE_TTL_MS;
    item.text = nextText;
    const span = item.el.querySelector('span');
    if (span) span.textContent = item.text;
  }

  update() {
    const width  = window.innerWidth  || this.domElement.clientWidth  || 1;
    const height = window.innerHeight || this.domElement.clientHeight || 1;
    const now    = Date.now();

    this.items.forEach(item => {
      if (!item.root || !item.text || now > item.expiresAt) {
        item.el.style.opacity = '0';
        return;
      }
      this.tmp.setFromMatrixPosition(item.root.matrixWorld);
      this.tmp.y += 2.65;
      this.tmp.project(this.camera);

      const behind  = this.tmp.z < -1 || this.tmp.z > 1;
      const x       = (this.tmp.x * 0.5 + 0.5) * width;
      const y       = (-this.tmp.y * 0.5 + 0.5) * height;
      const visible = !behind && x > -80 && x < width + 80 && y > -80 && y < height + 80;

      item.el.style.opacity   = visible ? '1' : '0';
      item.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    });
  }

  _ensureStyles() {
    if (document.getElementById('overhead-bubble-styles')) return;
    const style = document.createElement('style');
    style.id = 'overhead-bubble-styles';
    style.textContent = `
      .overhead-bubble {
        position: fixed;
        left: 0; top: 0;
        z-index: 18;
        width: min(240px, 42vw);
        padding: 8px 10px;
        border-radius: 10px;
        font: 700 12px/1.4 Inter, system-ui, sans-serif;
        pointer-events: none;
        opacity: 0;
        transition: opacity .18s ease;
        filter: drop-shadow(0 8px 18px rgba(0,0,0,.30));
        direction: rtl;
        text-align: right;
      }
      .overhead-bubble::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -7px;
        transform: translateX(-50%) rotate(45deg);
        width: 14px; height: 14px;
        background: inherit;
      }
      .overhead-bubble strong {
        display: block;
        margin-bottom: 3px;
        font-size: 10px;
        letter-spacing: .06em;
        text-transform: uppercase;
        opacity: .8;
      }
      .overhead-bubble span {
        display: block;
        overflow-wrap: anywhere;
        font-weight: 500;
      }

      /* ── Arash — sky blue ── */
      .overhead-bubble--arash {
        background: #c8e6ff;
        border: 1px solid rgba(80, 160, 255, .55);
        color: #07213e;
      }
      .overhead-bubble--arash strong {
        color: #1560bd;
      }

      /* ── Aida — soft pink ── */
      .overhead-bubble--aida {
        background: #ffd6e7;
        border: 1px solid rgba(255, 105, 180, .45);
        color: #3a1020;
      }
      .overhead-bubble--aida strong {
        color: #c0186a;
      }

      @media (max-width: 720px) {
        .overhead-bubble { width: min(190px, 50vw); font-size: 11px; }
      }
    `;
    document.head.appendChild(style);
  }
}
