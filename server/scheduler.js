// scheduler.js — Tick engine with Creator directive priority
const cron = require('node-cron');
const {
  getState, saveState, getMemories, addMemory, logWeather,
  findDirectiveForTime, removeDirective, getDirectives
} = require('./database');
const { askGemini, LOCATIONS } = require('./gemini');
const { generateWeather } = require('./weather');

let tickCount = 0;
const firedDirectives = new Set();

// World time advances 30 real minutes per tick
// Tick runs every 1 real minute → 30 world-minutes per real minute
// So 1 full day (24h) = 48 ticks = 48 real minutes
// (User asked: "1 real minute = 1 game second" — interpreted as fast world time)
const WORLD_MINUTES_PER_TICK = 30;

function advanceWorldTime(currentTime, minutesToAdd = WORLD_MINUTES_PER_TICK) {
  const [h, m] = (currentTime || '06:00').split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Build today's upcoming schedule based on Creator directives + AI routine hints
function buildUpcomingSchedule(directives, worldTime, weather) {
  const schedule = [];

  // Add Creator directives
  if (directives && directives.length > 0) {
    directives.forEach(d => {
      schedule.push({
        id: d.id,
        time: d.time,
        label: d.label || d.action,
        action: d.action,
        recurring: d.recurring,
        source: 'creator'
      });
    });
  }

  // Add daily AI routine milestones (always shown)
  const routineMilestones = [
    { time: '05:00', label: 'Fajr Prayer', action: 'praying', source: 'routine' },
    { time: '06:00', label: 'Morning Tea & Breakfast', action: 'eating', source: 'routine' },
    { time: '06:30', label: 'Water the Fields', action: 'watering_crops', source: 'routine' },
    { time: '09:00', label: 'Chop Wood', action: 'chopping_wood', source: 'routine' },
    { time: '12:00', label: 'Dhuhr Prayer', action: 'praying', source: 'routine' },
    { time: '12:30', label: 'Lunch', action: 'eating', source: 'routine' },
    { time: '15:30', label: 'Asr Prayer', action: 'praying', source: 'routine' },
    { time: '16:00', label: 'Harvest / Tend Crops', action: 'harvesting', source: 'routine' },
    { time: '18:30', label: 'Maghrib Prayer', action: 'praying', source: 'routine' },
    { time: '19:00', label: 'Dinner', action: 'eating', source: 'routine' },
    { time: '21:00', label: 'Isha Prayer', action: 'praying', source: 'routine' },
    { time: '22:00', label: 'Sleep', action: 'sleeping', source: 'routine' },
  ];

  // Only add routine items that don't conflict with Creator directives
  const creatorTimes = new Set(schedule.map(s => s.time));
  routineMilestones.forEach(m => {
    if (!creatorTimes.has(m.time)) {
      schedule.push(m);
    }
  });

  // Sort by time
  schedule.sort((a, b) => a.time.localeCompare(b.time));

  // Filter to only show upcoming times (after current world time)
  const [ch, cm] = (worldTime || '00:00').split(':').map(Number);
  const currentMinutes = ch * 60 + cm;

  return schedule.filter(s => {
    const [sh, sm] = s.time.split(':').map(Number);
    const schedMinutes = sh * 60 + sm;
    return schedMinutes >= currentMinutes;
  }).slice(0, 10); // Show max 10 upcoming items
}

async function runTick(broadcast) {
  tickCount++;
  console.log(`\n[Scheduler] ⏰ Tick #${tickCount} — ${new Date().toLocaleTimeString()}`);

  try {
    const state    = getState();
    const memories = getMemories(10);
    const directives = getDirectives();
    const newWorldTime = advanceWorldTime(state.world_time);
    const weather  = generateWeather(tickCount);

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
        thought: 'My Creator has asked this of me... I will obey.'
      };

      if (!directive.recurring) {
        removeDirective(directive.id);
        console.log(`[Scheduler] 🗑️ One-time directive removed after execution`);
      }
    } else {
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
    if (decision.memory) {
      console.log(`[Scheduler] Memory logged: ${decision.memory}`);
      addMemory(decision.memory);
    }

    // Build upcoming schedule to broadcast with state
    const upcomingSchedule = buildUpcomingSchedule(directives, newWorldTime, weather);
    const { GEMINI_API_KEY } = require('./config');

    broadcast({
      type: 'state',
      data: {
        ...newState,
        thought: decision.thought,
        memories: getMemories(5),
        upcomingSchedule,
        apiKeyMissing: !GEMINI_API_KEY || GEMINI_API_KEY === 'MISSING_KEY'
      }
    });

    console.log(`[Scheduler] Broadcast sent. Action: ${newState.current_action} | Time: ${newWorldTime}`);
    console.log(`[Scheduler] ✅ ${decision.action} | E:${newState.energy} H:${newState.hunger} | ${weather}`);
  } catch (err) {
    console.error('[Scheduler] ❌ Error:', err.message);
  }
}

function startScheduler(broadcast) {
  // Run every 1 real minute (world time advances 30 min per tick = 48 ticks per day)
  const interval = parseInt(process.env.TICK_INTERVAL || '1');
  console.log(`[Scheduler] Heartbeat every ${interval} min — World advances ${WORLD_MINUTES_PER_TICK} min per tick`);

  // First tick after 4 seconds
  setTimeout(() => runTick(broadcast), 4000);

  // Then every 1 minute
  cron.schedule(`*/${interval} * * * *`, () => runTick(broadcast));
}

module.exports = { startScheduler };
