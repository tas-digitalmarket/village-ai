// scheduler.js — Tick engine with Creator directive priority
const cron = require('node-cron');
const {
  getState, saveState, getMemories, addMemory, logWeather,
  findDirectiveForTime, removeDirective
} = require('./database');
const { askGemini, LOCATIONS } = require('./gemini');
const { generateWeather } = require('./weather');

let tickCount = 0;
// Track which directives fired this session (to avoid double-fire)
const firedDirectives = new Set();

function advanceWorldTime(currentTime, minutesToAdd = 30) {
  const [h, m] = (currentTime || '06:00').split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function runTick(broadcast) {
  tickCount++;
  console.log(`\n[Scheduler] ⏰ Tick #${tickCount} — ${new Date().toLocaleTimeString()}`);

  try {
    const state   = getState();
    const memories = getMemories(10);
    const newWorldTime = advanceWorldTime(state.world_time);
    const weather = generateWeather(tickCount);

    logWeather(weather, newWorldTime);

    // ── Check for Creator directives first ──────────────────────
    let decision = null;
    const directive = findDirectiveForTime(newWorldTime);

    if (directive && !firedDirectives.has(directive.id)) {
      firedDirectives.add(directive.id);
      console.log(`[Scheduler] 🎯 Creator directive matched: ${directive.label} @ ${newWorldTime}`);

      const pos = LOCATIONS[directive.location] || { x: state.position_x || 0, z: state.position_z || 0 };
      decision = {
        action: directive.action,
        target_location: directive.location,
        target_position: pos,
        duration: 30,
        energy_delta: directive.action === 'sleeping' ? 10 : directive.action === 'eating' ? 5 : -3,
        hunger_delta: directive.action === 'eating' ? -15 : 2,
        new_mood: 'content',
        memory: `Creator commanded: ${directive.label} at ${newWorldTime}`,
        thought: 'خالقم این کار را از من خواست...'
      };

      // Remove one-time directives after execution
      if (!directive.recurring) {
        removeDirective(directive.id);
        console.log(`[Scheduler] 🗑️ One-time directive removed after execution`);
      }
    } else {
      // ── Normal AI decision ──────────────────────────────────────
      // Clear fired directives set on new day to allow recurring ones to fire again
      if (newWorldTime === '00:00' || newWorldTime === '00:30') {
        firedDirectives.clear();
        console.log('[Scheduler] 🌅 New day — recurring directives reset');
      }
      decision = await askGemini(state, memories, weather);
    }

    const newState = {
      position_x: decision.target_position?.x ?? state.position_x ?? 0,
      position_y: 0,
      position_z: decision.target_position?.z ?? state.position_z ?? 0,
      energy: clamp((state.energy || 80) + (decision.energy_delta || 0), 0, 100),
      hunger: clamp((state.hunger || 20) + (decision.hunger_delta || 0), 0, 100),
      current_action: decision.action || 'idle',
      weather,
      world_time: newWorldTime,
      mood: decision.new_mood || state.mood || 'content'
    };

    saveState(newState);
    if (decision.memory) addMemory(decision.memory);

    broadcast({
      type: 'state',
      data: {
        ...newState,
        thought: decision.thought,
        memories: getMemories(5)
      }
    });

    console.log(`[Scheduler] ✅ ${decision.action} | E:${newState.energy} H:${newState.hunger} | ${weather} | ${newWorldTime}`);
  } catch (err) {
    console.error('[Scheduler] ❌ Error:', err.message);
  }
}

function startScheduler(broadcast) {
  const interval = parseInt(process.env.TICK_INTERVAL || '5');
  console.log(`[Scheduler] Heartbeat every ${interval} min...`);

  // First tick after 4 seconds
  setTimeout(() => runTick(broadcast), 4000);

  // Then every N minutes
  cron.schedule(`*/${interval} * * * *`, () => runTick(broadcast));
}

module.exports = { startScheduler };
