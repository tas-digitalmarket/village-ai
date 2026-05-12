// scheduler.js - minute pulse engine. Every 2 real seconds equals 1 Arash-world minute.
const {
  getState, saveState, getMemories, addMemory, logWeather,
  removeDirective, getDirectives, WORLD_DAY_REAL_MINUTES
} = require('./database');
const { LOCATIONS } = require('./ai');
const { generateWeather } = require('./weather');
const { readWorldState, updateWorldStateForTick } = require('./world-state');

const WORLD_MINUTE_REAL_MS = 2000;
const DEFAULT_TASK_DURATION_MINUTES = 30;
const WORLD_DRIFT_MINUTES = 30;
const WAKE_UP_MINUTE = 6 * 60;
const SLEEP_START_MINUTE = 22 * 60;

let tickCount = 0;
const firedKeys = new Set();

const ROUTINE_MILESTONES = [
  { time: '08:00', label: 'Wake Up & Breakfast', action: 'eating', location: 'table', duration: 25, source: 'routine' },
  { time: '09:00', label: 'Water the Fields', action: 'watering_crops', location: 'east_field', duration: 35, source: 'routine' },
  { time: '10:30', label: 'Chop Wood', action: 'chopping_wood', location: 'wood_stump', duration: 35, source: 'routine' },
  { time: '12:00', label: 'Lunch', action: 'eating', location: 'table', duration: 25, source: 'routine' },
  { time: '12:30', label: 'Afternoon Rest', action: 'sitting', location: 'bed', duration: 45, source: 'routine' },
  { time: '13:30', label: 'Tend Crops', action: 'tending_crops', location: 'west_field', duration: 35, source: 'routine' },
  { time: '15:00', label: 'Check Motorcycle', action: 'checking_motorcycle', location: 'motorcycle', duration: 25, source: 'routine' },
  { time: '16:00', label: 'Harvest Crops', action: 'harvesting', location: 'east_field', duration: 45, source: 'routine' },
  { time: '17:30', label: 'Wander the Farm', action: 'wandering', location: 'path_center', duration: 35, source: 'routine' },
  { time: '18:30', label: 'Dinner', action: 'eating', location: 'table', duration: 25, source: 'routine' },
  { time: '19:30', label: 'Evening Rest', action: 'sitting', location: 'bed', duration: 50, source: 'routine' },
  { time: '21:00', label: 'Evening Stroll', action: 'wandering', location: 'path_center', duration: 35, source: 'routine' },
  { time: '22:00', label: 'Sleep', action: 'sleeping', location: 'bed', duration: 480, source: 'routine' }
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function parseMinutes(time) {
  const [h = 0, m = 0] = String(time || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function absoluteMinute(day, worldTime) {
  return ((day || 1) - 1) * 1440 + parseMinutes(worldTime);
}

function taskKey(day, item) {
  return `${day}:${item.source}:${item.id || item.time}:${item.action}`;
}

function isNightMinute(minute) {
  return minute >= SLEEP_START_MINUTE || minute < WAKE_UP_MINUTE;
}

function nextWakeAbs(absMinute, currentMinute) {
  if (currentMinute < WAKE_UP_MINUTE) return absMinute + (WAKE_UP_MINUTE - currentMinute);
  return absMinute + (1440 - currentMinute) + WAKE_UP_MINUTE;
}

function actionEnergyDelta(action) {
  if (action === 'sleeping') return 2;
  if (action === 'eating' || action === 'sitting') return 1;
  if (action === 'running_to_shelter') return -2;
  return -1;
}

function actionHungerDelta(action) {
  if (action === 'eating') return -12;
  if (action === 'sleeping') return 1;
  return 1;
}

function isOutsideAction(action) {
  return ['walking', 'chopping_wood', 'watering_crops', 'harvesting', 'running_to_shelter', 'fishing', 'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'].includes(action);
}

function applyBodyNeeds(state, worldState, weather, minute) {
  const action = state.current_action || 'idle';
  let energy = Number(state.energy ?? 80);
  let hunger = Number(state.hunger ?? 20);
  let mood = state.mood || 'content';

  const foodLow = (worldState.storage?.food ?? 0) <= 2;
  const isStormOutside = (weather === 'stormy' || weather === 'rainy') && isOutsideAction(action);
  const heatWork = minute >= 12 * 60 && minute <= 16 * 60 && isOutsideAction(action) && weather === 'sunny';

  hunger += action === 'eating' && !foodLow ? -1.6 : action === 'sleeping' ? 0.04 : 0.08;

  if (action === 'sleeping') energy += 0.34;
  else if (action === 'sitting' || action === 'eating') energy += 0.04;
  else if (['watering_crops', 'harvesting', 'chopping_wood', 'tending_crops'].includes(action)) energy -= 0.18;
  else if (action === 'running_to_shelter') energy -= 0.26;
  else if (isOutsideAction(action)) energy -= 0.1;
  else energy -= 0.02;

  if (foodLow && hunger > 60) energy -= 0.05;
  if (isStormOutside) energy -= 0.08;
  if (heatWork) energy -= 0.05;
  if (hunger > 88) energy -= 0.08;

  energy = clamp(Math.round(energy), 0, 100);
  hunger = clamp(Math.round(hunger), 0, 100);

  if (hunger > 88) mood = 'hungry';
  else if (energy < 18) mood = 'tired';
  else if (isStormOutside) mood = 'worried';
  else if (action === 'eating') mood = 'content';
  else if (action === 'sleeping') mood = 'tired';
  else if (['watering_crops', 'harvesting', 'chopping_wood', 'tending_crops'].includes(action)) mood = 'focused';

  return { ...state, energy, hunger, mood };
}

function normalizeDirective(directive) {
  return {
    ...directive,
    source: 'creator',
    label: directive.label || directive.action || 'Creator task',
    location: directive.location || directive.target_location || 'path_center',
    duration: Number(directive.duration || DEFAULT_TASK_DURATION_MINUTES)
  };
}

function dueCreatorTask(directives, day, worldTime) {
  const minute = parseMinutes(worldTime);
  return directives.map(normalizeDirective).find(d => {
    if (!d.time) return false;
    if (parseMinutes(d.time) !== minute) return false;
    return !firedKeys.has(taskKey(day, d));
  }) || null;
}

function dueRoutineTask(day, worldTime) {
  const minute = parseMinutes(worldTime);
  return ROUTINE_MILESTONES.find(item => {
    const start = parseMinutes(item.time);
    const duration = Math.max(1, Number(item.duration || DEFAULT_TASK_DURATION_MINUTES));
    if (minute < start || minute >= start + duration) return false;
    return !firedKeys.has(taskKey(day, item));
  }) || null;
}

function buildUpcomingSchedule(directives, worldTime) {
  const schedule = [];
  (directives || []).map(normalizeDirective).forEach(d => {
    schedule.push({
      id: d.id,
      time: d.time,
      label: d.label || d.action,
      action: d.action,
      recurring: d.recurring,
      source: 'creator'
    });
  });

  const creatorTimes = new Set(schedule.map(s => s.time));
  ROUTINE_MILESTONES.forEach(m => {
    if (!creatorTimes.has(m.time)) {
      schedule.push({ time: m.time, label: m.label, action: m.action, source: 'routine' });
    }
  });

  schedule.sort((a, b) => a.time.localeCompare(b.time));
  const currentMinutes = parseMinutes(worldTime || '00:00');
  return schedule.filter(s => parseMinutes(s.time) >= currentMinutes).slice(0, 10);
}

function startTask(item, state, absMinute) {
  const location = item.location || 'path_center';
  const pos = LOCATIONS[location] || LOCATIONS.path_center || { x: 0, z: 0 };
  const duration = Math.max(1, Number(item.duration || DEFAULT_TASK_DURATION_MINUTES));
  return {
    ...state,
    current_action: item.action || 'idle',
    active_task_label: item.label || item.action || 'Task',
    active_task_source: item.source || 'routine',
    task_started_at_abs: absMinute,
    task_ends_at_abs: absMinute + duration,
    position_x: pos.x,
    position_y: 0,
    position_z: pos.z,
    energy: clamp((state.energy || 80) + actionEnergyDelta(item.action), 0, 100),
    hunger: clamp((state.hunger || 20) + actionHungerDelta(item.action), 0, 100),
    mood: item.action === 'sleeping' ? 'tired' : item.action === 'eating' ? 'content' : 'focused'
  };
}

function startNightSleep(state, absMinute, currentMinute) {
  const pos = LOCATIONS.bed || LOCATIONS.path_center || { x: 0, z: 0 };
  return {
    ...state,
    current_action: 'sleeping',
    active_task_label: 'Sleep',
    active_task_source: 'routine',
    task_started_at_abs: absMinute,
    task_ends_at_abs: nextWakeAbs(absMinute, currentMinute),
    position_x: pos.x,
    position_y: 0,
    position_z: pos.z,
    energy: clamp((state.energy || 80) + 2, 0, 100),
    hunger: clamp((state.hunger || 20) + 1, 0, 100),
    mood: 'tired'
  };
}

function idleState(state) {
  return {
    ...state,
    current_action: 'idle',
    active_task_label: null,
    active_task_source: null,
    task_started_at_abs: null,
    task_ends_at_abs: null,
    mood: state.mood || 'content'
  };
}

function maybeUpdateWorldDrift(state, worldState, weather, absMinute) {
  const last = Number(state.last_world_drift_abs || 0);
  if (last && absMinute - last < WORLD_DRIFT_MINUTES) return { worldState, lastWorldDriftAbs: last };
  return {
    worldState: updateWorldStateForTick(worldState, { action: 'idle', target_location: 'path_center' }, weather),
    lastWorldDriftAbs: absMinute
  };
}

async function runMinutePulse(broadcast) {
  tickCount++;

  try {
    const state = getState();
    const directives = getDirectives();
    const day = state.day || 1;
    const worldTime = state.world_time || '06:00';
    const minute = parseMinutes(worldTime);
    const abs = absoluteMinute(day, worldTime);
    const weather = generateWeather();
    let worldState = readWorldState();
    let nextState = applyBodyNeeds({ ...state, weather, day, world_time: worldTime }, worldState, weather, minute);
    let thought = null;

    logWeather(weather, worldTime);

    if (minute <= 1) firedKeys.clear();

    if (nextState.current_action !== 'idle' && !nextState.task_ends_at_abs) {
      nextState = idleState(nextState);
      thought = 'کار قبلی ام تمام شده؛ تا برنامه بعدی آرام می مانم.';
    }

    if (nextState.current_action !== 'idle' && nextState.task_ends_at_abs && abs >= Number(nextState.task_ends_at_abs)) {
      nextState = idleState(nextState);
      thought = 'کارم تمام شد؛ تا کار بعدی کمی آرام می مانم.';
    }

    if (isNightMinute(minute) && nextState.current_action !== 'sleeping') {
      nextState = startNightSleep(nextState, abs, minute);
      thought = 'وقت خواب شبانه است؛ تا صبح استراحت می کنم.';
    }

    if (nextState.energy <= 8 && nextState.current_action !== 'sleeping') {
      nextState = startNightSleep(nextState, abs, minute);
      thought = 'بدنم دیگر توان ندارد؛ باید بخوابم تا از پا نیفتم.';
    }

    if (nextState.current_action === 'idle') {
      const task = dueCreatorTask(directives, day, worldTime) || dueRoutineTask(day, worldTime);
      if (task) {
        firedKeys.add(taskKey(day, task));
        nextState = startTask(task, nextState, abs);
        worldState = updateWorldStateForTick(worldState, {
          action: task.action,
          target_location: task.location || 'path_center'
        }, weather);
        thought = task.source === 'creator'
          ? 'زمان دستور خالق رسیده؛ انجامش می دهم.'
          : `${task.label} رسیده؛ شروع می کنم.`;
        addMemory(`آرش در ساعت ${worldTime} کار ${task.label || task.action} را شروع کرد.`);
        if (task.source === 'creator' && !task.recurring && task.id) removeDirective(task.id);
      }
    }

    const drift = maybeUpdateWorldDrift(nextState, worldState, weather, abs);
    worldState = drift.worldState;
    nextState.last_world_drift_abs = drift.lastWorldDriftAbs;
    saveState(nextState);

    const upcomingSchedule = buildUpcomingSchedule(getDirectives(), worldTime, weather);
    const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY } = require('./config');
    const hasAiKey =
      (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY') ||
      (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY');

    broadcast({
      type: 'state',
      data: {
        ...nextState,
        world_state: worldState,
        thought,
        memories: getMemories(5),
        upcomingSchedule,
        apiKeyMissing: !hasAiKey
      }
    });
  } catch (err) {
    console.error('[Scheduler] Minute pulse error:', err.message);
  }
}

function startScheduler(broadcast) {
  console.log(`[Scheduler] World clock: 1 world day = ${WORLD_DAY_REAL_MINUTES} real minutes`);
  console.log('[Scheduler] Minute pulse: every 2 real seconds = 1 world minute');

  setTimeout(() => runMinutePulse(broadcast), WORLD_MINUTE_REAL_MS);
  setInterval(() => runMinutePulse(broadcast), WORLD_MINUTE_REAL_MS);
}

async function catchUpSimulation() {
  return getState();
}

module.exports = { startScheduler, buildUpcomingSchedule, catchUpSimulation };
