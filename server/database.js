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

function migrateTimeModelIfNeeded() {
  const state = db.get('agent_state').value() || {};
  if (state.time_model_version === TIME_MODEL_VERSION) return;

  db.set('agent_state', {
    ...state,
    world_time: '06:00',
    day: 1,
    time_model_version: TIME_MODEL_VERSION,
    timestamp: new Date().toISOString()
  }).write();
  console.log('[DB] Time model upgraded: 48 real minutes per world day. Reset to Day 1, 06:00.');
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
      { content: 'Arash woke up at dawn and looked at the sky', timestamp: new Date().toISOString() },
      { content: 'Had a simple breakfast of bread and cheese', timestamp: new Date().toISOString() },
      { content: 'Went to the farm to check on the crops', timestamp: new Date().toISOString() }
    ],
    directives: [],
    creator_messages: [],
    weather_log: []
  }).write();

  migrateTimeModelIfNeeded();
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

function addMemory(content) {
  const mem = db.get('memories');
  mem.push({ content, timestamp: new Date().toISOString() }).write();
  const all = db.get('memories').value();
  if (all.length > 100) db.set('memories', all.slice(-100)).write();
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
  getMemories, addMemory,
  getDirectives, addDirective, removeDirective, clearAllDirectives, findDirectiveForTime,
  getCreatorMessages, addCreatorMessage,
  logWeather,
  WORLD_DAY_REAL_MINUTES
};
