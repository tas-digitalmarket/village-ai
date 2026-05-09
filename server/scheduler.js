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
// Tick runs every 60 real seconds → 30 world-minutes per 60s
const WORLD_MINUTES_PER_TICK = 30;

function getFallbackAction(h, weather, state) {
  const isInside = state.position_z < -5;
  let action = 'idle', loc = 'path_center';

  if ((weather === 'rainy' || weather === 'stormy') && !isInside) {
    action = 'running_to_shelter'; loc = 'home';
  }
  else if (state.energy < 15) { action = 'sleeping';          loc = 'bed'; }
  else if (state.hunger > 85) { action = 'eating';            loc = 'table'; }
  else if (h >= 22 || h < 8)  { action = 'sleeping';           loc = 'bed'; }
  else if (h < 8.5)           { action = 'eating';             loc = 'table'; }
  else if (h < 10.5)          { action = 'watering_crops';     loc = 'east_field'; }
  else if (h < 12)            { action = 'chopping_wood';      loc = 'wood_stump'; }
  else if (h < 13.5)          { action = 'sitting';            loc = 'bed'; }
  else if (h < 15)            { action = 'tending_crops';      loc = 'west_field'; }
  else if (h < 17.5)          { action = 'harvesting';         loc = 'east_field'; }
  else if (h < 18.5)          { action = 'wandering';          loc = 'path_center'; }
  else if (h < 20)            { action = 'eating';             loc = 'table'; }
  else if (h < 22)            { action = 'sitting';            loc = 'bed'; }
  
  const pos = LOCATIONS[loc] || { x: 0, z: 0 };
  return { action, loc, pos };
}

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
    { time: '08:00', label: 'Wake Up & Breakfast',   action: 'eating',              source: 'routine' },
    { time: '09:00', label: 'Water the Fields',      action: 'watering_crops',      source: 'routine' },
    { time: '10:30', label: 'Chop Wood',             action: 'chopping_wood',       source: 'routine' },
    { time: '12:00', label: 'Lunch',                 action: 'eating',              source: 'routine' },
    { time: '12:30', label: 'Afternoon Rest',        action: 'sitting',             source: 'routine' },
    { time: '13:30', label: 'Tend Crops',            action: 'tending_crops',       source: 'routine' },
    { time: '15:00', label: 'Check Motorcycle',      action: 'checking_motorcycle', source: 'routine' },
    { time: '16:00', label: 'Harvest Crops',         action: 'harvesting',          source: 'routine' },
    { time: '17:30', label: 'Wander the Farm',       action: 'wandering',           source: 'routine' },
    { time: '18:30', label: 'Dinner',                action: 'eating',              source: 'routine' },
    { time: '19:30', label: 'Evening Rest',          action: 'sitting',             source: 'routine' },
    { time: '21:00', label: 'Evening Stroll',        action: 'wandering',           source: 'routine' },
    { time: '22:00', label: 'Sleep',                 action: 'sleeping',            source: 'routine' },
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

    // Build upcoming schedule FIRST so we can pass it to Gemini
    const upcomingSchedule = buildUpcomingSchedule(directives, newWorldTime, weather);

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
        thought: 'خالقم از من خواسته... اطاعت می‌کنم.'
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
      decision = await askGemini(state, memories, weather, newWorldTime, upcomingSchedule);
    }

    const prevTime = state.world_time || '06:00';
    const [prevH] = prevTime.split(':').map(Number);
    const [newH]  = newWorldTime.split(':').map(Number);
    // Crossed midnight: previous hour was late (>=22) and new hour is early (0 or 1)
    const crossedMidnight = prevH >= 22 && newH <= 1;
    const currentDay = state.day || 1;
    const newDay = crossedMidnight ? currentDay + 1 : currentDay;

    if (crossedMidnight) {
      console.log(`[Scheduler] 🌅 New day! Day ${newDay} begins.`);
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
      day: newDay,
      mood: decision.new_mood || state.mood || 'content'
    };

    saveState(newState);
    if (decision.memory) {
      console.log(`[Scheduler] Memory logged: ${decision.memory}`);
      addMemory(decision.memory);
    }

    // Build upcoming schedule to broadcast with state (already built above, just pass it down)
    const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY } = require('./config');
    const hasAiKey =
      (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY') ||
      (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY');

    broadcast({
      type: 'state',
      data: {
        ...newState,
        thought: decision.thought,
        memories: getMemories(5),
        upcomingSchedule,
        apiKeyMissing: !hasAiKey
      }
    });

    console.log(`[Scheduler] Broadcast sent. Action: ${newState.current_action} | Time: ${newWorldTime}`);
    console.log(`[Scheduler] ✅ ${decision.action} | E:${newState.energy} H:${newState.hunger} | ${weather}`);
  } catch (err) {
    console.error('[Scheduler] ❌ Error:', err.message);
  }
}

function startScheduler(broadcast) {
  // Read TICK_INTERVAL from .env (in minutes), default to 5 minutes to prevent 429 Rate Limits
  const tickMinutes = parseInt(process.env.TICK_INTERVAL) || 5;
  const intervalMs = tickMinutes * 60 * 1000; 
  console.log(`[Scheduler] Intelligence: Every ${tickMinutes}m — World advances ${WORLD_MINUTES_PER_TICK} min per tick`);

  // First tick after 5 seconds to reduce join wait time
  setTimeout(() => runTick(broadcast), 5000);

  // Use setInterval for sub-minute accuracy
  setInterval(() => runTick(broadcast), intervalMs);
}

async function catchUpSimulation(broadcast) {
  console.log('[Scheduler] ⏳ Checking for time gaps to catch up...');
  const state = getState();
  const lastTime = state.timestamp ? new Date(state.timestamp).getTime() : Date.now();
  const now = Date.now();
  const elapsedMs = now - lastTime;
  const elapsedMin = Math.floor(elapsedMs / 1000 / 60);

  // 1 tick = 1 real minute
  let ticksToCatchUp = Math.floor(elapsedMin / 1);
  if (ticksToCatchUp <= 0) {
    console.log('[Scheduler] ✨ No catch-up needed.');
    return;
  }

  // Cap at 48 ticks (1 day) to avoid massive processing
  if (ticksToCatchUp > 48) {
    console.log(`[Scheduler] ⚠️ Long gap detected (${elapsedMin} min). Capping catch-up to 48 ticks (1 day).`);
    ticksToCatchUp = 48;
  }

  console.log(`[Scheduler] ⏩ Fast-forwarding ${ticksToCatchUp} ticks...`);

  let currentState = state;
  for (let i = 0; i < ticksToCatchUp; i++) {
    const nextTime = advanceWorldTime(currentState.world_time);
    const [hStr, mStr] = nextTime.split(':');
    const hNum = parseInt(hStr) + (parseInt(mStr)/60);
    
    // Check midnight
    const [prevH] = currentState.world_time.split(':').map(Number);
    const [newH]  = nextTime.split(':').map(Number);
    const crossedMidnight = prevH >= 22 && newH <= 1;
    const newDay = crossedMidnight ? (currentState.day || 1) + 1 : (currentState.day || 1);

    // Get fallback decision for speed (no AI calls during catch-up)
    const fb = getFallbackAction(hNum, currentState.weather || 'sunny', currentState);
    
    currentState = {
      ...currentState,
      world_time: nextTime,
      day: newDay,
      energy: clamp((currentState.energy || 80) + (fb.action === 'sleeping' ? 10 : -3), 0, 100),
      hunger: clamp((currentState.hunger || 20) + (fb.action === 'eating' ? -15 : 2), 0, 100),
      current_action: fb.action,
      position_x: fb.pos.x,
      position_z: fb.pos.z,
      timestamp: new Date(lastTime + (i+1)*60*1000).toISOString()
    };
  }

  saveState(currentState);
  console.log(`[Scheduler] ✅ Catch-up complete. New Time: Day ${currentState.day}, ${currentState.world_time}`);
}

module.exports = { startScheduler, buildUpcomingSchedule, catchUpSimulation };
