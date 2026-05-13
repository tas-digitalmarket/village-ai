const fs = require('fs');
const path = require('path');

const RENDER_DATA_DIR = '/data/village';
const DATA_DIR = process.env.DATA_DIR ||
  (process.env.RENDER && fs.existsSync('/data') ? RENDER_DATA_DIR : path.join(__dirname, '../data'));
const SOCIAL_FILE = path.join(DATA_DIR, 'social-messages.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDataDir();
  if (!fs.existsSync(SOCIAL_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[SocialChat] Failed to read social messages:', err.message);
    return [];
  }
}

function writeAll(messages) {
  ensureDataDir();
  fs.writeFileSync(SOCIAL_FILE, JSON.stringify(messages.slice(-300), null, 2));
}

function normalizeSpeaker(value) {
  return String(value || '').toLowerCase() === 'aida' ? 'aida' : 'arash';
}

function normalizeLine(line, meta = {}) {
  const text = String(line?.text || '').trim();
  if (!text) return null;
  return {
    id: `soc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    speaker: normalizeSpeaker(line.speaker),
    text,
    world_day: meta.world_day || null,
    world_time: meta.world_time || null,
    source: meta.source || 'world_dialogue',
    timestamp: new Date().toISOString()
  };
}

function getSocialMessages(limit = 40) {
  return readAll().slice(-limit);
}

function addSocialDialogueMessages(lines = [], meta = {}) {
  if (!Array.isArray(lines) || !lines.length) return getSocialMessages();
  const current = readAll();
  let changed = false;

  lines.forEach((line) => {
    const next = normalizeLine(line, meta);
    if (!next) return;
    const lastSameSpeaker = [...current].reverse().find(item => item.speaker === next.speaker);
    if (lastSameSpeaker && lastSameSpeaker.text === next.text) return;
    current.push(next);
    changed = true;
  });

  if (changed) writeAll(current);
  return current.slice(-40);
}

module.exports = { getSocialMessages, addSocialDialogueMessages };
