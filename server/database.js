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
      mood: 'content',
      timestamp: new Date().toISOString()
    },
    memories: [
      { content: 'آرش در سپیده‌دم بیدار شد و به آسمان نگاه کرد', timestamp: new Date().toISOString() },
      { content: 'صبحانه ساده‌ای از نان و پنیر خورد',              timestamp: new Date().toISOString() },
      { content: 'به مزرعه رفت تا محصولات را بررسی کند',           timestamp: new Date().toISOString() }
    ],
    weather_log: []
  }).write();

  console.log('[DB] Initialized:', DB_FILE);
}

function getState() {
  return db.get('agent_state').value() || {};
}

function saveState(newState) {
  db.set('agent_state', { ...newState, timestamp: new Date().toISOString() }).write();
}

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

module.exports = { initDatabase, getState, saveState, getMemories, addMemory, logWeather };
