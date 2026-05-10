// scheduler.js - Tick engine with Creator directive priority
const {
  getState, saveState, getMemories, addMemory, logWeather,
  findDirectiveForTime, removeDirective, getDirectives, WORLD_DAY_REAL_MINUTES
} = require('./database');
const { askGemini, LOCATIONS } = require('./gemini');
const { generateWeather } = require('./weather');
const { readWorldState, updateWorldStateForTick } = require('./world-state');

let tickCount = 0;
const firedDirectives = new Set();
const DECISION_TICK_REAL_MINUTES = Number(process.env.DECISION_TICK_REAL_MINUTES || 2);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getFallbackAction(h, weather, state, worldState = readWorldState()) {
  const isInside = state.position_z < -5;
  let action = 'idle', loc = 'path_center';

  if ((weather === 'rainy' || weather === 'stormy') && !isInside) {
    action = 'running_to_shelter'; loc = 'home';
  } else if (state.energy < 15 || h >= 22 || h < 6) {
    action = 'sleeping'; loc = 'bed';
  } else if (state.hunger > 85) {
    action = 'eating'; loc = 'table';
  } else if (worldState.animals.hunger > 80 && h >= 7 && h < 19) {
    action = 'tending_animals'; loc = 'haystack';
  } else if (worldState.fields.east.growth > 82 && h >= 8 && h < 18) {
    action = 'harvesting'; loc = 'east_field';
  } else if (worldState.fields.west.growth > 82 && h >= 8 && h < 18) {
    action = 'harvesting'; loc = 'west_field';
  } else if (worldState.fields.east.moisture < 28 && h >= 7 && h < 17) {
    action = 'watering_crops'; loc = 'east_field';
  } else if (worldState.fields.west.moisture < 28 && h >= 7 && h < 17) {
    action = 'watering_crops'; loc = 'west_field';
  } else if (worldState.storage.wood < 5 && h >= 9 && h < 17) {
    action = 'chopping_wood'; loc = 'wood_stump';
  } else if (worldState.motorcycle.condition < 45 && h >= 10 && h < 18) {
    action = 'checking_motorcycle'; loc = 'motorcycle';
  } else if (h < 8.5) {
    action = 'eating'; loc = 'table';
  } else if (h < 10.5) {
    action = 'watering_crops'; loc = worldState.fields.east.moisture <= worldState.fields.west.moisture ? 'east_field' : 'west_field';
  } else if (h < 12) {
    action = 'chopping_wood'; loc = 'wood_stump';
  } else if (h < 13.5) {
    action = 'sitting'; loc = 'bed';
  } else if (h < 15) {
    action = 'tending_crops'; loc = worldState.fields.east.health <= worldState.fields.west.health ? 'east_field' : 'west_field';
  } else if (h < 17.5) {
    action = 'harvesting'; loc = worldState.fields.east.growth >= worldState.fields.west.growth ? 'east_field' : 'west_field';
  } else if (h < 18.5) {
    action = 'wandering'; loc = 'path_center';
  } else if (h < 20) {
    action = 'eating'; loc = 'table';
  } else {
    action = 'sitting'; loc = 'bed';
  }

  const pos = LOCATIONS[loc] || { x: 0, z: 0 };
  return { action, loc, pos };
}

function buildUpcomingSchedule(directives, worldTime) {
  const schedule = [];
  if (directives && directives.length > 0) {
    directives.forEach(d => schedule.push({
      id: d.id,
      time: d.time,
      label: d.label || d.action,
      action: d.action,
      recurring: d.recurring,
      source: 'creator'
    }));
  }

  const routineMilestones = [
    { time: '08:00', label: 'Wake Up & Breakfast', action: 'eating', source: 'routine' },
    { time: '09:00', label: 'Water the Fields', action: 'watering_crops', source: 'routine' },
    { time: '10:30', label: 'Chop Wood', action: 'chopping_wood', source: 'routine' },
    { time: '12:00', label: 'Lunch', action: 'eating', source: 'routine' },
    { time: '12:30', label: 'Afternoon Rest', action: 'sitting', source: 'routine' },
    { time: '13:30', label: 'Tend Crops', action: 'tending_crops', source: 'routine' },
    { time: '15:00', label: 'Check Motorcycle', action: 'checking_motorcycle', source: 'routine' },
    { time: '16:00', label: 'Harvest Crops', action: 'harvesting', source: 'routine' },
    { time: '17:30', label: 'Wander the Farm', action: 'wandering', source: 'routine' },
    { time: '18:30', label: 'Dinner', action: 'eating', source: 'routine' },
    { time: '19:30', label: 'Evening Rest', action: 'sitting', source: 'routine' },
    { time: '21:00', label: 'Evening Stroll', action: 'wandering', source: 'routine' },
    { time: '22:00', label: 'Sleep', action: 'sleeping', source: 'routine' }
  ];

  const creatorTimes = new Set(schedule.map(s => s.time));
  routineMilestones.forEach(m => { if (!creatorTimes.has(m.time)) schedule.push(m); });
  schedule.sort((a, b) => a.time.localeCompare(b.time));

  const [ch, cm] = String(worldTime || '00:00').split(':').map(Number);
  const currentMinutes = ch * 60 + cm;
  return schedule.filter(s => {
    const [sh, sm] = s.time.split(':').map(Number);
    return sh * 60 + sm >= currentMinutes;
  }).slice(0, 10);
}

function decisionFromDirective(directive, state, worldTime) {
  const pos = LOCATIONS[directive.location] || { x: state.position_x || 0, z: state.position_z || 0 };
  return {
    action: directive.action,
    target_location: directive.location,
    target_position: pos,
    duration: 30,
    energy_delta: directive.action === 'sleeping' ? 10 : directive.action === 'eating' ? 5 : -3,
    hunger_delta: directive.action === 'eating' ? -15 : 2,
    new_mood: 'content',
    memory: `Creator commanded: ${directive.label} at ${worldTime}`,
    thought: 'خالق از من خواسته و انجامش می‌دهم.'
  };
}

function buildFallbackDecision(state, weather, timeStr, worldState) {
  const [hh, mm = 0] = String(timeStr || '08:00').split(':').map(Number);
  const fb = getFallbackAction(hh + mm / 60, weather, state, worldState);
  return {
    action: fb.action,
    target_location: fb.loc,
    target_position: fb.pos,
    duration: 30,
    energy_delta: fb.action === 'sleeping' ? 12 : fb.action === 'eating' ? 5 : -3,
    hunger_delta: fb.action === 'eating' ? -18 : 3,
    new_mood: fb.action === 'running_to_shelter' ? 'worried' : fb.action === 'sleeping' ? 'tired' : 'focused',
    memory: `آرش در ساعت ${timeStr} تصمیم گرفت ${fb.action} انجام دهد.`,
    thought: 'بر اساس وضعیت مزرعه و بدنم، این کار الان منطقی‌تر است.'
  };
}

async function runTick(broadcast) {
  tickCount++;
  console.log(`\n[Scheduler] Decision tick #${tickCount} - ${new Date().toLocaleTimeString()}`);

  try {
    const state = getState();
    const memories = getMemories(10);
    const directives = getDirectives();
    const worldState = readWorldState();
    const worldTime = state.world_time || '06:00';
    const weather = generateWeather(tickCount);

    logWeather(weather, worldTime);
    const upcomingSchedule = buildUpcomingSchedule(directives, worldTime, weather);

    let decision = null;
    const directive = findDirectiveForTime(worldTime);
    if (directive && !firedDirectives.has(directive.id)) {
      firedDirectives.add(directive.id);
      decision = decisionFromDirective(directive, state, worldTime);
      if (!directive.recurring) removeDirective(directive.id);
    } else {
      if (worldTime === '00:00' || worldTime === '00:01') firedDirectives.clear();
      try {
        decision = await askGemini(state, memories, weather, worldTime, upcomingSchedule, worldState);
      } catch (err) {
        console.warn('[Scheduler] AI decision failed, using world-aware fallback:', err.message);
        decision = buildFallbackDecision(state, weather, worldTime, worldState);
      }
    }

    const newState = {
      position_x: decision.target_position?.x ?? state.position_x ?? 0,
      position_y: 0,
      position_z: decision.target_position?.z ?? state.position_z ?? 0,
      energy: clamp((state.energy || 80) + (decision.energy_delta || 0), 0, 100),
      hunger: clamp((state.hunger || 20) + (decision.hunger_delta || 0), 0, 100),
      current_action: decision.action || 'idle',
      weather,
      world_time: worldTime,
      day: state.day || 1,
      mood: decision.new_mood || state.mood || 'content'
    };

    saveState(newState);
    const newWorldState = updateWorldStateForTick(worldState, decision, weather);
    if (decision.memory) addMemory(decision.memory);

    const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY } = require('./config');
    const hasAiKey =
      (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY') ||
      (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY');

    broadcast({
      type: 'state',
      data: {
        ...newState,
        world_state: newWorldState,
        thought: decision.thought,
        memories: getMemories(5),
        upcomingSchedule,
        apiKeyMissing: !hasAiKey
      }
    });

    console.log(`[Scheduler] ${newState.current_action} | Day ${newState.day} ${worldTime} | World day = ${WORLD_DAY_REAL_MINUTES} real minutes`);
  } catch (err) {
    console.error('[Scheduler] Error:', err.message);
  }
}

function startScheduler(broadcast) {
  const intervalMs = DECISION_TICK_REAL_MINUTES * 60 * 1000;
  console.log(`[Scheduler] World clock: 1 world day = ${WORLD_DAY_REAL_MINUTES} real minutes`);
  console.log(`[Scheduler] Decisions: every ${DECISION_TICK_REAL_MINUTES} real minutes`);

  setTimeout(() => runTick(broadcast), intervalMs);
  setInterval(() => runTick(broadcast), intervalMs);
}

async function catchUpSimulation() {
  return getState();
}

module.exports = { startScheduler, buildUpcomingSchedule, catchUpSimulation };
