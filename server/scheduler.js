const cron = require('node-cron');
const { getState, saveState, getMemories, addMemory, logWeather } = require('./database');
const { askGemini } = require('./gemini');
const { generateWeather } = require('./weather');

let tickCount = 0;

function advanceWorldTime(currentTime, minutesToAdd = 15) {
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
    const state = getState();
    const memories = getMemories(10);
    const newWorldTime = advanceWorldTime(state.world_time);
    const weather = generateWeather(tickCount);

    logWeather(weather, newWorldTime);

    const decision = await askGemini(state, memories, weather);

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
