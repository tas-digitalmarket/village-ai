import * as THREE from 'three';

const ARASH_ACTION_TEXT = {
  idle: ['فعلاً دارم اطرافم را نگاه می‌کنم.', 'کمی مکث کرده‌ام تا ببینم کار بعدی چیست.'],
  walking: ['دارم قدم می‌زنم.', 'آرام دارم راه می‌روم.'],
  sitting: ['نشسته‌ام و کمی استراحت می‌کنم.', 'چند دقیقه بدنم را آرام می‌کنم.'],
  eating: ['دارم غذا می‌خورم.', 'اول باید شکمم را سیر کنم.'],
  sleeping: ['خوابیده‌ام.', 'تا صبح باید استراحت کنم.'],
  watering_crops: ['دارم به مزرعه آب می‌دهم.', 'محصول‌ها آب می‌خواهند؛ دارم آبیاری می‌کنم.'],
  harvesting: ['دارم محصول برداشت می‌کنم.', 'وقت برداشت رسیده و دارم جمعش می‌کنم.'],
  chopping_wood: ['دارم هیزم خرد می‌کنم.', 'برای خانه هیزم آماده می‌کنم.'],
  tending_crops: ['دارم به محصول‌ها رسیدگی می‌کنم.', 'حواسم به حال مزرعه است.'],
  tending_animals: ['دارم به حیوانات رسیدگی می‌کنم.', 'حیوانات هم سهم خودشان را از روز دارند.'],
  fishing: ['دارم ماهیگیری می‌کنم.', 'کنار آب دنبال غذا می‌گردم.'],
  checking_motorcycle: ['دارم موتور را بررسی می‌کنم.', 'باید ببینم موتور چه وضعی دارد.'],
  wandering: ['دارم کمی در مزرعه قدم می‌زنم.', 'اطراف مزرعه را نگاه می‌کنم.'],
  running_to_shelter: ['هوا بد است؛ دارم به خانه برمی‌گردم.', 'باید خودم را به سرپناه برسانم.'],
  praying: ['دارم دعا می‌کنم.', 'چند لحظه برای دعا ایستاده‌ام.'],
  resting: ['دارم کمی استراحت می‌کنم.', 'فعلاً آرام مانده‌ام.']
};

const AIDA_ACTION_TEXT = {
  idle: ['فعلاً در خانه‌ام آرام هستم.', 'کمی ایستاده‌ام و به کار بعدی فکر می‌کنم.'],
  walking: ['دارم به سمت مقصد می‌روم.', 'آرام از کنار خانه راه افتاده‌ام.'],
  sitting: ['نشسته‌ام و کمی فکر می‌کنم.', 'چند دقیقه آرام گرفته‌ام.'],
  resting: ['کمی استراحت می‌کنم.', 'فعلاً بدنم را آرام می‌کنم.'],
  eating: ['دارم غذا می‌خورم.', 'برای ادامه روز باید چیزی بخورم.'],
  sleeping: ['خوابیده‌ام.', 'وقت خواب و آرامش خانه است.'],
  morning_garden: ['دارم به باغچه صبحگاهی‌ام رسیدگی می‌کنم.', 'صبح برای گیاه‌ها وقت خوبی است.'],
  checking_herbs: ['دارم گیاهان دارویی را بررسی می‌کنم.', 'گیاه‌ها را مرتب می‌کنم و نگاهشان می‌کنم.'],
  watering_garden: ['دارم باغچه را آب می‌دهم.', 'باغچه امروز آب می‌خواهد.'],
  watering_crops: ['دارم باغچه را آب می‌دهم.', 'به خاک و گیاه‌ها آب می‌رسانم.'],
  animal_care: ['دارم به حیوانات کوچکمان رسیدگی می‌کنم.', 'حیوانات کوچک را آرام چک می‌کنم.'],
  tending_animals: ['دارم به حیوانات سر می‌زنم.', 'حواسم به حیوانات خانه است.'],
  tending_crops: ['دارم به گیاهان رسیدگی می‌کنم.', 'گیاه‌ها را بررسی می‌کنم.'],
  village_errand: ['برای کاری به میدان روستا می‌روم.', 'باید سری به مرکز روستا بزنم.'],
  evening_prayer: ['در آرامش شب دعا می‌کنم.', 'چند لحظه برای دعا کنار می‌ایستم.'],
  shared_path_garden: ['دارم کنار مسیر مشترک باغچه را مرتب می‌کنم.', 'با آرش کنار راه کار مشترک داریم.'],
  neighbor_walk: ['دارم کنار خانه همسایه قدم می‌زنم.', 'آرام به اطراف خانه‌های نزدیک سر می‌زنم.'],
  wandering: ['دارم اطراف خانه‌ام قدم می‌زنم.', 'کمی دور خانه‌ام راه می‌روم.'],
  running_to_shelter: ['هوا بد است؛ دارم برمی‌گردم خانه.', 'باید زودتر بروم داخل خانه.']
};

const DIRTY_PATTERNS = [
  /started\s+\w/i,
  /Fallback active/i,
  /No specific reason/i,
  /AI provided no reason/i,
  /Keep character/i,
  /^[a-z_]+$/,
  /Aida started/i,
  /Arash started/i,
  /completed.*at\s+\d/i,
  /\bstarted\b/i,
  /\bfinished\b/i,
  /Ø|Ù|Ú|Û|â|Â/
];

const BUBBLE_TTL_MS = 30000;
const MAX_LEN = 90;

function isDirty(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  if (!t || t.length < 3) return true;
  return DIRTY_PATTERNS.some(re => re.test(t));
}

function pickLine(characterName, state, list) {
  const items = Array.isArray(list) ? list : [list].filter(Boolean);
  if (!items.length) return '';
  const key = `${characterName}|${state.day || ''}|${state.world_time || ''}|${state.current_action || ''}|${state.active_task_source || ''}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return items[hash % items.length];
}

export function formatCharacterBubble(characterName, state = {}) {
  const isAida = characterName === 'aida';
  const map = isAida ? AIDA_ACTION_TEXT : ARASH_ACTION_TEXT;
  const thought = state.thought;
  if (thought && !isDirty(thought)) return clampText(thought);
  const action = state.current_action || '';
  if (action && map[action]) return clampText(pickLine(characterName, state, map[action]));
  const label = state.active_task_label || '';
  if (label && !isDirty(label) && /[\u0600-\u06FF]/.test(label)) return clampText(label);
  return isAida ? 'در خانه‌ام آرام هستم.' : 'دارم به مزرعه فکر می‌کنم.';
}

export function sanitizeBubbleText(text, characterName, action) {
  if (!isDirty(text)) return clampText(text);
  const map = characterName === 'aida' ? AIDA_ACTION_TEXT : ARASH_ACTION_TEXT;
  const fallback = map[action] || (characterName === 'aida' ? AIDA_ACTION_TEXT.idle : ARASH_ACTION_TEXT.idle);
  return clampText(pickLine(characterName, { current_action: action, world_time: new Date().toTimeString().slice(0, 5) }, fallback));
}

function clampText(value, fallback = '') {
  const text = String(value || fallback).trim();
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
}

export class CharacterSpeechBubbles {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.items = new Map();
    this.tmp = new THREE.Vector3();
    this._ensureStyles();
  }

  add(name, root, tone) {
    const key = name.toLowerCase();
    const label = key === 'aida' ? 'AIDA' : 'ARASH';
    const el = document.createElement('div');
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
    const width = window.innerWidth || this.domElement.clientWidth || 1;
    const height = window.innerHeight || this.domElement.clientHeight || 1;
    const now = Date.now();

    this.items.forEach(item => {
      if (!item.root || !item.text || now > item.expiresAt) {
        item.el.style.opacity = '0';
        return;
      }
      this.tmp.setFromMatrixPosition(item.root.matrixWorld);
      this.tmp.y += 2.65;
      this.tmp.project(this.camera);

      const behind = this.tmp.z < -1 || this.tmp.z > 1;
      const x = (this.tmp.x * 0.5 + 0.5) * width;
      const y = (-this.tmp.y * 0.5 + 0.5) * height;
      const visible = !behind && x > -80 && x < width + 80 && y > -80 && y < height + 80;

      item.el.style.opacity = visible ? '1' : '0';
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
      .overhead-bubble--arash {
        background: #c8e6ff;
        border: 1px solid rgba(80, 160, 255, .55);
        color: #07213e;
      }
      .overhead-bubble--arash strong { color: #1560bd; }
      .overhead-bubble--aida {
        background: #ffd6e7;
        border: 1px solid rgba(255, 105, 180, .45);
        color: #3a1020;
      }
      .overhead-bubble--aida strong { color: #c0186a; }
      @media (max-width: 720px) {
        .overhead-bubble { width: min(190px, 50vw); font-size: 11px; }
      }
    `;
    document.head.appendChild(style);
  }
}
