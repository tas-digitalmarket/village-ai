// scheduler.js - minute pulse engine. Every 2 real seconds equals 1 Arash-world minute.
const {
  getState, saveState, getMemories, addMemory, logWeather,
  removeDirective, getDirectives, WORLD_DAY_REAL_MINUTES,
  getPlan, savePlan, getGoals, getRelationship
} = require('./database');
const { LOCATIONS } = require('./ai');
const { updateAidaRoutine, buildAidaSocialDialogue } = require('./aida');
const { generateWeather } = require('./weather');
const { readWorldState, applyWorldDrift, applyActionConsequences } = require('./world-state');
const { buildRiskProfile, chooseRiskTask } = require('./risk-model');
const {
  ensureDailyPlan, chooseGoalTask, completeGoalStep, recordSkillProgress,
  buildNightReflection, maybeCreateWorldEvent, defaultSkills
} = require('./life-planner');
const { createPlan, getNextPlanStep, markPlanStepDone, invalidatePlan } = require('./agent-planner');
const { decideNextAction } = require('./life-brain');

const WORLD_MINUTE_REAL_MS = 2000;
const DEFAULT_TASK_DURATION_MINUTES = 30;
const WORLD_DRIFT_MINUTES = 30;
const WAKE_UP_MINUTE = 6 * 60;
const SLEEP_START_MINUTE = 22 * 60;

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

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function roundNeed(v) { return Math.round(v * 10) / 10; }
function parseMinutes(time) { const [h = 0, m = 0] = String(time || '00:00').split(':').map(Number); return h * 60 + m; }
function absoluteMinute(day, worldTime) { return ((day || 1) - 1) * 1440 + parseMinutes(worldTime); }
function taskKey(day, item) { return `${day}:${item.source}:${item.id || item.time || item.risk_id || item.goal_id || 'need'}:${item.action}`; }
function isNightMinute(minute) { return minute >= SLEEP_START_MINUTE || minute < WAKE_UP_MINUTE; }
function nextWakeAbs(absMinute, currentMinute) { if (currentMinute < WAKE_UP_MINUTE) return absMinute + (WAKE_UP_MINUTE - currentMinute); return absMinute + (1440 - currentMinute) + WAKE_UP_MINUTE; }
function isOutsideAction(action) { return ['walking', 'chopping_wood', 'watering_crops', 'harvesting', 'running_to_shelter', 'fishing', 'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'].includes(action); }
function actionEnergyDelta(action) { if (action === 'sleeping') return 2; if (action === 'eating' || action === 'sitting') return 1; if (action === 'running_to_shelter') return -2; return -1; }
function actionHungerDelta(action) { if (action === 'eating') return -12; if (action === 'sleeping') return 1; return 1; }

function applyBodyNeeds(state, worldState, weather, minute) {
  const action = state.current_action || 'idle';
  let energy = Number(state.energy ?? 80);
  let hunger = Number(state.hunger ?? 20);
  let mood = state.mood || 'content';
  const foodLow = (worldState.storage?.food ?? 0) <= 2;
  const stormOutside = (weather === 'stormy' || weather === 'rainy') && isOutsideAction(action);
  const heatWork = minute >= 12 * 60 && minute <= 16 * 60 && isOutsideAction(action) && weather === 'sunny';
  const longTask = state.task_started_at_abs && state.task_ends_at_abs && Number(state.task_ends_at_abs) - Number(state.task_started_at_abs) >= 45;

  hunger += action === 'eating' && !foodLow ? -1.6 : action === 'sleeping' ? 0.04 : 0.08;
  if (action === 'sleeping') energy += 0.34;
  else if (action === 'sitting' || action === 'eating') energy += 0.04;
  else if (['watering_crops', 'harvesting', 'chopping_wood', 'tending_crops'].includes(action)) energy -= longTask ? 0.24 : 0.18;
  else if (action === 'running_to_shelter') energy -= 0.26;
  else if (isOutsideAction(action)) energy -= 0.1;
  else energy -= 0.02;

  if (foodLow && hunger > 60) energy -= 0.05;
  if (stormOutside) energy -= weather === 'stormy' ? 0.14 : 0.08;
  if (heatWork) energy -= 0.08;
  if (hunger > 88) energy -= 0.08;

  energy = roundNeed(clamp(energy, 0, 100));
  hunger = roundNeed(clamp(hunger, 0, 100));

  if (hunger > 88) mood = 'hungry';
  else if (energy < 18 || heatWork) mood = 'tired';
  else if (stormOutside) mood = 'worried';
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

function dueCreatorTask(directives, day, worldTime) { const minute = parseMinutes(worldTime); return directives.map(normalizeDirective).find(d => d.time && parseMinutes(d.time) === minute && !firedKeys.has(taskKey(day, d))) || null; }
function dueRoutineTask(day, worldTime) { const minute = parseMinutes(worldTime); return ROUTINE_MILESTONES.find(item => { const start = parseMinutes(item.time); const duration = Math.max(1, Number(item.duration || DEFAULT_TASK_DURATION_MINUTES)); return minute >= start && minute < start + duration && !firedKeys.has(taskKey(day, item)); }) || null; }
function fieldChoice(world, predicate) { const entries = [{ key: 'east', location: 'east_field', field: world.fields?.east || {} }, { key: 'west', location: 'west_field', field: world.fields?.west || {} }].filter(({ field }) => predicate(field)); if (!entries.length) return null; entries.sort((a, b) => ((b.field.growth || 0) - (a.field.growth || 0)) || ((a.field.moisture || 0) - (b.field.moisture || 0))); return entries[0]; }
function makeNeedTask(label, action, location, duration = 25, priority = 50, reason = '') { return { time: null, label, action, location, duration, source: 'need', priority, reason }; }

function chooseNeedDrivenTask(state, worldState, weather, minute, criticalOnly = false) {
  const riskTask = chooseRiskTask(state, worldState, weather, minute, criticalOnly);
  if (riskTask) return riskTask;
  const energy = Number(state.energy ?? 80);
  const hunger = Number(state.hunger ?? 20);
  const food = Number(worldState.storage?.food ?? 0);
  const inShelter = (state.position_z || 0) < -5;
  const readyField = fieldChoice(worldState, f => (f.growth || 0) >= 85);
  const dryField = fieldChoice(worldState, f => (f.moisture || 0) <= 18);
  const weakField = fieldChoice(worldState, f => (f.health || 0) <= 45);
  if (energy <= 14) return makeNeedTask('Emergency Sleep', 'sleeping', 'bed', 75, 100, 'energy is critically low');
  if (hunger >= 92 && food > 0) return makeNeedTask('Eat Before Weakness', 'eating', 'table', 20, 98, 'hunger is critical');
  if ((weather === 'stormy' || weather === 'rainy') && !inShelter && energy < 35) return makeNeedTask('Take Shelter', 'running_to_shelter', 'home', 12, 95, 'bad weather and low energy');
  if (criticalOnly) return null;
  if (hunger >= 82 && food > 0) return makeNeedTask('Eat Something', 'eating', 'table', 20, 88, 'hunger is high');
  if (food <= 2 && readyField) return makeNeedTask('Harvest Food Reserve', 'harvesting', readyField.location, 40, 86, 'food is low and crops are ready');
  if (readyField) return makeNeedTask('Harvest Ready Crops', 'harvesting', readyField.location, 40, 82, 'crops are ready');
  if (dryField && (worldState.well?.water_level ?? 0) > 8) return makeNeedTask('Water Dry Field', 'watering_crops', dryField.location, 30, 78, 'a field is too dry');
  if ((worldState.animals?.hunger ?? 0) >= 78 && food > 1) return makeNeedTask('Feed Animals', 'tending_animals', 'fence_north', 25, 74, 'animals are hungry');
  if (weakField) return makeNeedTask('Tend Weak Crops', 'tending_crops', weakField.location, 30, 70, 'crop health is weak');
  if ((worldState.house?.cleanliness ?? 100) <= 24) return makeNeedTask('Clean The House', 'sitting', 'home', 25, 60, 'house is getting dirty');
  if ((worldState.motorcycle?.condition ?? 100) <= 35) return makeNeedTask('Repair Motorcycle', 'checking_motorcycle', 'motorcycle', 25, 58, 'motorcycle condition is poor');
  if (food <= 1) return makeNeedTask('Fish For Food', 'fishing', 'fishing_spot', 35, 56, 'food is almost gone');
  return null;
}

function buildUpcomingSchedule(directives, worldTime) {
  const schedule = [];
  (directives || []).map(normalizeDirective).forEach(d => schedule.push({ id: d.id, time: d.time, label: d.label || d.action, action: d.action, recurring: d.recurring, source: 'creator' }));
  const creatorTimes = new Set(schedule.map(s => s.time));
  ROUTINE_MILESTONES.forEach(m => { if (!creatorTimes.has(m.time)) schedule.push({ time: m.time, label: m.label, action: m.action, source: 'routine' }); });
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
    active_task_reason: item.reason || null,
    active_task_location: location,
    active_goal_id: item.goal_id || null,
    active_goal_title: item.goal_title || null,
    active_risk_id: item.risk_id || null,
    active_risk_severity: item.risk_severity || null,
    // Store step_id so completeActiveTask can mark the exact step done
    active_plan_step_id: item.source === 'planner' ? (item.step_id || null) : null,
    task_started_at_abs: absMinute,
    task_ends_at_abs: absMinute + duration,
    position_x: pos.x,
    position_y: 0,
    position_z: pos.z,
    energy: roundNeed(clamp((state.energy || 80) + actionEnergyDelta(item.action), 0, 100)),
    hunger: roundNeed(clamp((state.hunger || 20) + actionHungerDelta(item.action), 0, 100)),
    mood: item.action === 'sleeping' ? 'tired' : item.action === 'eating' ? 'content' : 'focused'
  };
}
function idleState(state) {
  return {
    ...state,
    current_action: 'idle',
    active_task_label: null,
    active_task_source: null,
    active_task_reason: null,
    active_task_location: null,
    active_goal_id: null,
    active_goal_title: null,
    active_risk_id: null,
    active_risk_severity: null,
    active_plan_step_id: null,
    task_started_at_abs: null,
    task_ends_at_abs: null,
    mood: state.mood || 'content'
  };
}
function startNightSleep(state, absMinute, currentMinute) { return startTask({ label: 'Sleep', action: 'sleeping', location: 'bed', duration: nextWakeAbs(absMinute, currentMinute) - absMinute, source: 'routine', reason: 'night sleep' }, state, absMinute); }
function maybeUpdateWorldDrift(state, worldState, weather, absMinute) { const last = Number(state.last_world_drift_abs || 0); if (last && absMinute - last < WORLD_DRIFT_MINUTES) return { worldState, lastWorldDriftAbs: last }; return { worldState: applyWorldDrift(worldState, weather), lastWorldDriftAbs: absMinute }; }

function completeActiveTask(state, worldState, weather, worldTime) {
  const action = state.current_action;
  const label = state.active_task_label || action;
  const location = state.active_task_location || 'path_center';
  if (!action || action === 'idle') return { state: idleState(state), worldState, thought: null };
  const result = applyActionConsequences(worldState, { action, target_location: location }, weather);
  let nextState = recordSkillProgress(state, action);
  nextState = completeGoalStep(nextState, action, location);

  // Mark the exact plan step done for Arash
  let currentPlan = getPlan('arash');
  if (currentPlan && currentPlan.status === 'active') {
    const stepId = state.active_plan_step_id;
    let matchedStep = null;

    if (stepId) {
      // Preferred: match by stored step_id (exact and reliable)
      matchedStep = currentPlan.steps.find(s => s.id === stepId && s.status === 'pending');
      if (matchedStep) {
        console.log(`[Planner:Arash] completed step by ID: ${stepId}`);
      }
    }

    if (!matchedStep) {
      // Fallback: match by action + location
      matchedStep = currentPlan.steps.find(
        s => s.action === action && s.location === location && s.status === 'pending'
      );
      if (matchedStep) {
        console.log(`[Planner:Arash] completed step by action+location: ${action}@${location}`);
      }
    }

    if (!matchedStep) {
      // Last resort: match by action only
      matchedStep = currentPlan.steps.find(s => s.action === action && s.status === 'pending');
      if (matchedStep) {
        console.log(`[Planner:Arash] completed step by action only (fallback): ${action}`);
      }
    }

    if (matchedStep) {
      currentPlan = markPlanStepDone('arash', currentPlan, matchedStep.id);
      savePlan('arash', currentPlan);
    }
  }

  const notes = result.outcome.notes.length ? ` (${result.outcome.notes.join(', ')})` : '';
  const thought = result.outcome.success
    ? `کار ${label} تمام شد و اثرش را در جهان گذاشت.`
    : `کار ${label} کامل انجام نشد؛ شرایط کافی نبود.`;
  addMemory(`آرش در ساعت ${worldTime} کار ${label} را تمام کرد.${notes}`, { type: 'life', importance: result.outcome.success ? 6 : 7 });
  return { state: idleState(nextState), worldState: result.worldState, thought };
}

function taskThought(task) {
  if (task.source === 'creator') return 'زمان دستور خالق رسیده؛ انجامش می دهم.';
  if (task.risk_id) return `الان باید مراقب ${task.label} باشم؛ ${task.reason || 'خطر دارد بالا می رود'}.`;
  if (task.source === 'goal') return `برای هدف امروز، ${task.label} را شروع می کنم.`;
  if (task.source === 'need') return `الان ${task.label} مهم تر است؛ ${task.reason || 'بهتر است انجامش بدهم'}.`;
  return `${task.label} رسیده؛ شروع می کنم.`;
}

async function runMinutePulse(broadcast) {
  try {
    const state = getState();
    const directives = getDirectives();
    const day = state.day || 1;
    const worldTime = state.world_time || '06:00';
    const minute = parseMinutes(worldTime);
    const abs = absoluteMinute(day, worldTime);
    const weather = generateWeather();
    let worldState = readWorldState();
    let nextState = applyBodyNeeds({ ...state, weather, day, world_time: worldTime, skills: defaultSkills(state.skills) }, worldState, weather, minute);
    let riskState = buildRiskProfile(nextState, worldState, weather, minute);
    nextState = ensureDailyPlan(nextState, worldState, riskState);
    let thought = null;
    let aidaState = await updateAidaRoutine(worldTime);

    logWeather(weather, worldTime);
    if (minute <= 1) firedKeys.clear();

    if (nextState.current_action !== 'idle' && !nextState.task_ends_at_abs) {
      nextState = idleState(nextState);
      thought = 'کار قبلی ام تمام شده؛ تا برنامه بعدی آرام می مانم.';
    }
    if (nextState.current_action !== 'idle' && nextState.task_ends_at_abs && abs >= Number(nextState.task_ends_at_abs)) {
      const completed = completeActiveTask(nextState, worldState, weather, worldTime);
      nextState = completed.state;
      worldState = completed.worldState;
      thought = completed.thought;
    }

    riskState = buildRiskProfile(nextState, worldState, weather, minute);
    nextState = ensureDailyPlan(nextState, worldState, riskState);

    const eventResult = maybeCreateWorldEvent(nextState, worldState, riskState, weather);
    if (eventResult) {
      nextState = eventResult.state;
      addMemory(`رویداد جهان: ${eventResult.event.title}. ${eventResult.event.note}`, { type: 'world', importance: eventResult.event.severity >= 70 ? 8 : 5 });
      thought = thought || eventResult.event.note;
    }

    if (minute >= 21 * 60 + 45) {
      const reflection = buildNightReflection(nextState, worldState, riskState);
      if (reflection) {
        nextState = reflection.state;
        addMemory(reflection.text, { type: 'reflection', importance: reflection.importance });
      }
    }

    if (isNightMinute(minute) && nextState.current_action !== 'sleeping') {
      nextState = startNightSleep(nextState, abs, minute);
      thought = 'وقت خواب شبانه است؛ تا صبح استراحت می کنم.';
    }
    if (nextState.energy <= 8 && nextState.current_action !== 'sleeping') {
      nextState = startTask(makeNeedTask('Emergency Sleep', 'sleeping', 'bed', 75, 100, 'energy is critically low'), nextState, abs);
      thought = 'بدنم دیگر توان ندارد؛ باید بخوابم تا از پا نیفتم.';
    }

    if (nextState.current_action === 'idle') {
      const emergencyNeed = chooseNeedDrivenTask(nextState, worldState, weather, minute, true);
      const creatorTask = dueCreatorTask(directives, day, worldTime);
      let task = emergencyNeed || creatorTask;

      if (!task) {
        let currentPlan = getPlan('arash');
        
        if (currentPlan && currentPlan.status === 'active') {
          const step = getNextPlanStep('arash', currentPlan);
          if (step) {
            task = {
              source: 'planner',
              step_id: step.id,
              label: step.action,
              action: step.action,
              location: step.location,
              duration: 25,
              reason: step.reason,
              goal_id: currentPlan.active_goal,
              goal_title: currentPlan.active_goal
            };
          }
        }
        
        const lastPlannerCall = Number(nextState.last_planner_call_abs || 0);
        const shouldCallPlanner = !currentPlan || currentPlan.status !== 'active' || (abs - lastPlannerCall >= 20);
        
        if (!task && shouldCallPlanner) {
          const goals = getGoals('arash');
          const memories = getMemories(5);
          const relationships = getRelationship('arash_aida');
          
          currentPlan = await createPlan('arash', nextState, worldState, memories, relationships, goals, []);
          savePlan('arash', currentPlan);
          nextState.last_planner_call_abs = abs;
          
          const step = getNextPlanStep('arash', currentPlan);
          if (step) {
            task = {
              source: 'planner',
              step_id: step.id,
              label: step.action,
              action: step.action,
              location: step.location,
              duration: 25,
              reason: step.reason,
              goal_id: currentPlan.active_goal,
              goal_title: currentPlan.active_goal
            };
          }
        }
        
        if (!task) {
          const goals = getGoals('arash');
          const memories = getMemories(5);
          const relationships = getRelationship('arash_aida');
          
          const lifeDecision = await decideNextAction('arash', nextState, worldState, memories, relationships, [], goals);
          task = {
            source: 'life_brain',
            label: lifeDecision.action,
            action: lifeDecision.action,
            location: lifeDecision.location,
            duration: lifeDecision.duration,
            reason: lifeDecision.reason,
            goal_id: lifeDecision.goal,
            thought_override: lifeDecision.thought
          };
        }
        
        if (!task) {
          task = chooseNeedDrivenTask(nextState, worldState, weather, minute, false) || chooseGoalTask(nextState, minute) || dueRoutineTask(day, worldTime);
        }
      }

      if (task) {
        if (task.source !== 'need' && task.source !== 'goal' && task.source !== 'planner' && task.source !== 'life_brain') {
          firedKeys.add(taskKey(day, task));
        }
        nextState = startTask(task, nextState, abs);
        thought = task.thought_override || taskThought(task);
        addMemory(`آرش در ساعت ${worldTime} کار ${task.label || task.action} را شروع کرد.${task.reason ? ` دلیل: ${task.reason}.` : ''}`);
        if (task.source === 'creator' && !task.recurring && task.id) removeDirective(task.id);
      }
    }

    const drift = maybeUpdateWorldDrift(nextState, worldState, weather, abs);
    worldState = drift.worldState;
    nextState.last_world_drift_abs = drift.lastWorldDriftAbs;
    riskState = buildRiskProfile(nextState, worldState, weather, minute);
    nextState.risk_state = riskState;
    saveState(nextState);
    aidaState = { ...aidaState, social_dialogue: buildAidaSocialDialogue(nextState, aidaState, worldTime) };

    const upcomingSchedule = buildUpcomingSchedule(getDirectives(), worldTime, weather);
    const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY } = require('./config');
    const hasAiKey = (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY') || (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY');

    broadcast({
      type: 'state',
      data: {
        ...nextState,
        risk_state: riskState,
        world_state: worldState,
        thought,
        memories: getMemories(5),
        upcomingSchedule,
        ida_state: aidaState,
        social_dialogue: aidaState.social_dialogue,
        active_plan: getPlan('arash'),
        aida_active_plan: getPlan('aida'),
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

async function catchUpSimulation() { return getState(); }
module.exports = { startScheduler, buildUpcomingSchedule, catchUpSimulation };
