// database.js - lowdb v1 (pure JSON, no native bindings)
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

const RENDER_DATA_DIR = '/data/village';
const DATA_DIR = process.env.DATA_DIR ||
  (process.env.RENDER && fs.existsSync('/data') ? RENDER_DATA_DIR : path.join(__dirname, '../data'));
const DB_FILE = path.join(DATA_DIR, 'village.json');

const TIME_MODEL_VERSION = 2;
const WORLD_DAY_REAL_MINUTES = 48;
const WORLD_MINUTES_PER_REAL_MS = 1440 / (WORLD_DAY_REAL_MINUTES * 60 * 1000);

let db;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'you', 'your', 'arash', 'creator',
  'من', 'تو', 'او', 'ما', 'شما', 'آن', 'این', 'یک', 'در', 'به', 'از', 'را', 'با', 'برای',
  'که', 'است', 'هست', 'کرد', 'شد', 'می', 'های', 'هایش', 'خالق', 'آرش'
]);

function advanceTime(currentTime, minutesToAdd) {
  const [h = 6, m = 0] = String(currentTime || '06:00').split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const daysAdded = Math.floor(total / (24 * 60));
  const dayMinutes = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nh = Math.floor(dayMinutes / 60);
  const nm = dayMinutes % 60;
  return {
    world_time: `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`,
    daysAdded
  };
}

function getDefaultState() {
  return {
    position_x: 0,
    position_y: 0,
    position_z: 2,
    energy: 80,
    hunger: 20,
    current_action: 'idle',
    weather: 'sunny',
    world_time: '06:00',
    day: 1,
    mood: 'content',
    time_model_version: TIME_MODEL_VERSION,
    timestamp: new Date().toISOString()
  };
}

function extractKeywords(text, limit = 14) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:()\[\]{}"'،؛؟«»]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  return [...new Set(words)].slice(0, limit);
}

function inferMemoryType(content) {
  const text = String(content || '').toLowerCase();
  if (/creator|خالق|دستور|گفت|asked|told|command/.test(text)) return 'creator';
  if (/eat|food|غذا|خورد|گرسنگ/.test(text)) return 'survival';
  if (/sleep|خواب|استراحت/.test(text)) return 'survival';
  if (/field|crop|farm|مزرعه|زمین|محصول|آبیاری/.test(text)) return 'farm';
  if (/weather|rain|storm|هوا|باران|طوفان/.test(text)) return 'world';
  return 'life';
}

function inferMemoryImportance(content, type) {
  const text = String(content || '').toLowerCase();
  let score = type === 'creator' ? 8 : type === 'survival' ? 7 : 5;
  if (/always|never|هر روز|روزانه|همیشه|هرگز|مهم|remember|یادت/.test(text)) score += 2;
  if (/danger|storm|طوفان|خطر|گرسنگ|خسته|کمبود/.test(text)) score += 1;
  return Math.max(1, Math.min(10, score));
}

function normalizeMemory(entry) {
  const content = String(entry?.content || '').trim();
  const type = entry?.type || inferMemoryType(content);
  return {
    id: entry?.id || `mem_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    content,
    timestamp: entry?.timestamp || new Date().toISOString(),
    world_day: entry?.world_day || null,
    world_time: entry?.world_time || null,
    type,
    importance: Number(entry?.importance) || inferMemoryImportance(content, type),
    keywords: Array.isArray(entry?.keywords) && entry.keywords.length ? entry.keywords : extractKeywords(content)
  };
}

function migrateMemoriesIfNeeded() {
  const all = db.get('memories').value() || [];
  let changed = false;
  const normalized = all.map(entry => {
    if (entry && entry.id && entry.keywords && entry.type) return entry;
    changed = true;
    return normalizeMemory(entry);
  });
  if (changed) db.set('memories', normalized).write();
}

function migrateTimeModelIfNeeded() {
  const state = db.get('agent_state').value() || {};
  if (state.time_model_version === TIME_MODEL_VERSION) return;

  db.set('agent_state', {
    ...getDefaultState(),
    ...state,
    time_model_version: TIME_MODEL_VERSION,
    timestamp: new Date().toISOString()
  }).write();
  console.log('[DB] Time model upgraded: 48 real minutes per world day. Current world time preserved.');
}

function catchUpStateFromTimestamp(state) {
  if (!state || !state.timestamp) return state;

  const lastTime = new Date(state.timestamp).getTime();
  const elapsedMs = Date.now() - lastTime;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return state;

  const worldMinutesToAdd = Math.floor(elapsedMs * WORLD_MINUTES_PER_REAL_MS);
  if (worldMinutesToAdd <= 0) return state;

  const advanced = advanceTime(state.world_time, worldMinutesToAdd);
  const consumedMs = Math.floor(worldMinutesToAdd / WORLD_MINUTES_PER_REAL_MS);
  const nextState = {
    ...state,
    world_time: advanced.world_time,
    day: (state.day || 1) + advanced.daysAdded,
    time_model_version: TIME_MODEL_VERSION,
    timestamp: new Date(lastTime + consumedMs).toISOString()
  };

  db.set('agent_state', nextState).write();
  return nextState;
}

function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const adapter = new FileSync(DB_FILE);
  db = low(adapter);

  db.defaults({
    agent_state: getDefaultState(),
    memories: [
      normalizeMemory({ content: 'Arash woke up at dawn and looked at the sky', timestamp: new Date().toISOString(), type: 'life' }),
      normalizeMemory({ content: 'Had a simple breakfast of bread and cheese', timestamp: new Date().toISOString(), type: 'survival' }),
      normalizeMemory({ content: 'Went to the farm to check on the crops', timestamp: new Date().toISOString(), type: 'farm' })
    ],
    directives: [],
    fired_directive_ids: [],
    creator_messages: [],
    weather_log: []
  }).write();

  migrateTimeModelIfNeeded();
  migrateMemoriesIfNeeded();
  console.log('[DB] Initialized:', DB_FILE);
}

function getState() {
  return catchUpStateFromTimestamp(db.get('agent_state').value() || {});
}

function saveState(newState) {
  db.set('agent_state', {
    ...newState,
    time_model_version: TIME_MODEL_VERSION,
    timestamp: newState.timestamp || new Date().toISOString()
  }).write();
}

function getMemories(limit = 10) {
  const all = db.get('memories').value() || [];
  return all.slice(-limit).reverse();
}

function addMemory(content, meta = {}) {
  const state = db.get('agent_state').value() || {};
  const entry = normalizeMemory({
    content,
    world_day: meta.world_day ?? state.day ?? null,
    world_time: meta.world_time ?? state.world_time ?? null,
    type: meta.type,
    importance: meta.importance,
    keywords: meta.keywords
  });

  db.get('memories').push(entry).write();
  const all = db.get('memories').value();
  if (all.length > 300) db.set('memories', all.slice(-300)).write();
  return entry;
}

function searchMemories(query, limit = 8, options = {}) {
  const all = db.get('memories').value() || [];
  const qKeywords = extractKeywords(query, 20);
  const qSet = new Set(qKeywords);
  const now = Date.now();
  const preferredTypes = new Set(options.types || []);

  return all
    .map((memory, index) => {
      const normalized = normalizeMemory(memory);
      const overlap = normalized.keywords.filter(k => qSet.has(k)).length;
      const text = normalized.content.toLowerCase();
      const directHit = qKeywords.some(k => text.includes(k)) ? 1 : 0;
      const ageMs = now - new Date(normalized.timestamp).getTime();
      const ageDays = Number.isFinite(ageMs) ? ageMs / 86400000 : 30;
      const recency = Math.max(0, 3 - Math.min(3, ageDays / 2));
      const typeBoost = preferredTypes.has(normalized.type) ? 2 : 0;
      const score = overlap * 4 + directHit * 2 + normalized.importance * 0.8 + recency + typeBoost + index / 10000;
      return { ...normalized, score };
    })
    .filter(memory => memory.score > 3 || qKeywords.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getDirectives() {
  return db.get('directives').value() || [];
}

function addDirective(directive) {
  const id = `dir_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const entry = { id, ...directive, createdAt: new Date().toISOString() };
  db.get('directives').push(entry).write();
  console.log(`[DB] Directive added: ${entry.label} @ ${entry.time} (recurring:${entry.recurring})`);
  return entry;
}

function removeDirective(id) {
  const all = db.get('directives').value() || [];
  db.set('directives', all.filter(d => d.id !== id)).write();
  console.log(`[DB] Directive removed: ${id}`);
}

function clearAllDirectives() {
  db.set('directives', []).write();
  console.log('[DB] All directives cleared');
}

function findDirectiveForTime(worldTime) {
  const directives = getDirectives();
  if (!directives.length) return null;

  const [h, m] = worldTime.split(':').map(Number);
  const worldMinutes = h * 60 + m;
  return directives.find(d => {
    if (!d.time) return false;
    const [dh, dm] = d.time.split(':').map(Number);
    const dirMinutes = dh * 60 + dm;
    return Math.abs(worldMinutes - dirMinutes) <= 5;
  }) || null;
}

function getFiredDirectiveIds() {
  return new Set(db.get('fired_directive_ids').value() || []);
}

function addFiredDirectiveId(id) {
  const ids = db.get('fired_directive_ids').value() || [];
  if (!ids.includes(id)) db.get('fired_directive_ids').push(id).write();
}

function clearFiredDirectiveIds() {
  db.set('fired_directive_ids', []).write();
  console.log('[DB] Fired directive IDs cleared');
}

function getCreatorMessages(limit = 20) {
  const all = db.get('creator_messages').value() || [];
  return all.slice(-limit);
}

function addCreatorMessage(role, content) {
  db.get('creator_messages').push({ role, content, timestamp: new Date().toISOString() }).write();
  const all = db.get('creator_messages').value();
  if (all.length > 200) db.set('creator_messages', all.slice(-200)).write();
}

function logWeather(weather, worldTime) {
  db.get('weather_log')
    .push({ weather, world_time: worldTime, timestamp: new Date().toISOString() })
    .write();
  const logs = db.get('weather_log').value();
  if (logs.length > 200) db.set('weather_log', logs.slice(-200)).write();
}

module.exports = {
  initDatabase,
  getState, saveState,
  getMemories, addMemory, searchMemories,
  getDirectives, addDirective, removeDirective, clearAllDirectives, findDirectiveForTime,
  getFiredDirectiveIds, addFiredDirectiveId, clearFiredDirectiveIds,
  getCreatorMessages, addCreatorMessage,
  logWeather,
  WORLD_DAY_REAL_MINUTES
};
