// database.js — lowdb v1 (pure JSON, no native bindings)
const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_FILE  = path.join(DATA_DIR, 'village.json');

let db;

function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const adapter = new FileSync(DB_FILE);
  db = low(adapter);

  // Default schema
  db.defaults({
    agent_state: {
      position_x: 0, position_y: 0, position_z: 2,
      energy: 80, hunger: 20,
      current_action: 'idle',
      weather: 'sunny',
      world_time: '06:00',
      day: 1,
      mood: 'content',
      timestamp: new Date().toISOString()
    },
    memories: [
      { content: 'Arash woke up at dawn and looked at the sky', timestamp: new Date().toISOString() },
      { content: 'Had a simple breakfast of bread and cheese', timestamp: new Date().toISOString() },
      { content: 'Went to the farm to check on the crops', timestamp: new Date().toISOString() }
    ],
    directives: [],
    creator_messages: [],
    weather_log: []
  }).write();

  console.log('[DB] Initialized:', DB_FILE);
}

// ── Agent State ─────────────────────────────────────────────────
function getState() {
  return db.get('agent_state').value() || {};
}

function saveState(newState) {
  db.set('agent_state', { ...newState, timestamp: new Date().toISOString() }).write();
}

// ── Memories ─────────────────────────────────────────────────────
function getMemories(limit = 10) {
  const all = db.get('memories').value() || [];
  return all.slice(-limit).reverse(); // most recent first
}

function addMemory(content) {
  const mem = db.get('memories');
  mem.push({ content, timestamp: new Date().toISOString() }).write();

  // Keep only last 100
  const all = db.get('memories').value();
  if (all.length > 100) {
    db.set('memories', all.slice(-100)).write();
  }
}

// ── Directives (Creator commands) ────────────────────────────────
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

// Find a directive matching the given world time (±14 min window)
function findDirectiveForTime(worldTime) {
  const directives = getDirectives();
  if (!directives.length) return null;

  const [h, m] = worldTime.split(':').map(Number);
  const worldMinutes = h * 60 + m;

  return directives.find(d => {
    if (!d.time) return false;
    const [dh, dm] = d.time.split(':').map(Number);
    const dirMinutes = dh * 60 + dm;
    // Match within a 5-minute window (since ticks are now every 10 game-minutes)
    return Math.abs(worldMinutes - dirMinutes) <= 5;
  }) || null;
}

// ── Creator Messages ──────────────────────────────────────────────
function getCreatorMessages(limit = 20) {
  const all = db.get('creator_messages').value() || [];
  return all.slice(-limit);
}

function addCreatorMessage(role, content) {
  db.get('creator_messages').push({
    role, // 'creator' | 'arash'
    content,
    timestamp: new Date().toISOString()
  }).write();

  // Keep last 200 messages
  const all = db.get('creator_messages').value();
  if (all.length > 200) {
    db.set('creator_messages', all.slice(-200)).write();
  }
}

// ── Weather Log ───────────────────────────────────────────────────
function logWeather(weather, worldTime) {
  db.get('weather_log')
    .push({ weather, world_time: worldTime, timestamp: new Date().toISOString() })
    .write();

  // Keep only last 200 weather entries
  const logs = db.get('weather_log').value();
  if (logs.length > 200) {
    db.set('weather_log', logs.slice(-200)).write();
  }
}

module.exports = {
  initDatabase,
  getState, saveState,
  getMemories, addMemory,
  getDirectives, addDirective, removeDirective, clearAllDirectives, findDirectiveForTime,
  getCreatorMessages, addCreatorMessage,
  logWeather
};
