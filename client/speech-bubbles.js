import * as THREE from 'three';

const BUBBLE_TTL_MS = 30000;

function clampText(value, fallback) {
  const text = String(value || fallback || '').trim();
  return text.length > 92 ? `${text.slice(0, 89)}...` : text;
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
    const el = document.createElement('div');
    el.className = `overhead-bubble overhead-bubble--${tone}`;
    el.innerHTML = `<strong>${name}</strong><span></span>`;
    document.body.appendChild(el);
    this.items.set(name.toLowerCase(), { root, el, text: '', visible: true, expiresAt: 0 });
    return el;
  }

  setText(name, text) {
    const item = this.items.get(name.toLowerCase());
    if (!item) return;

    const nextText = clampText(text, '');
    if (!nextText) {
      item.text = '';
      item.expiresAt = 0;
      return;
    }

    if (nextText !== item.text || Date.now() > item.expiresAt) {
      item.expiresAt = Date.now() + BUBBLE_TTL_MS;
    }

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
        left: 0;
        top: 0;
        z-index: 18;
        width: min(240px, 42vw);
        padding: 8px 10px;
        border-radius: 8px;
        color: #07131e;
        font: 700 12px/1.35 Inter, system-ui, sans-serif;
        pointer-events: none;
        opacity: 0;
        transition: opacity .18s ease;
        filter: drop-shadow(0 10px 18px rgba(0,0,0,.28));
      }
      .overhead-bubble::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -7px;
        transform: translateX(-50%) rotate(45deg);
        width: 14px;
        height: 14px;
        background: inherit;
      }
      .overhead-bubble strong {
        display: block;
        margin-bottom: 3px;
        font-size: 10px;
        text-transform: uppercase;
        opacity: .72;
      }
      .overhead-bubble span {
        display: block;
        overflow-wrap: anywhere;
      }
      .overhead-bubble--arash { background: #8fc7ff; border: 1px solid rgba(255,255,255,.75); }
      .overhead-bubble--aida { background: #ffb3cf; border: 1px solid rgba(255,255,255,.75); }
      @media (max-width: 720px) { .overhead-bubble { width: min(190px, 48vw); font-size: 11px; } }
    `;
    document.head.appendChild(style);
  }
}
