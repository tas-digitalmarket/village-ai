function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseMinutes(time) {
  const [h = 0, m = 0] = String(time || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function skillLevel(skills = {}, key) {
  return skills[key]?.level || 1;
}

function defaultSkills(input = {}) {
  const base = {
    farming: { level: 1, xp: 0 },
    animals: { level: 1, xp: 0 },
    repair: { level: 1, xp: 0 },
    cooking: { level: 1, xp: 0 },
    survival: { level: 1, xp: 0 }
  };
  Object.keys(base).forEach(key => {
    if (input[key]) base[key] = { level: input[key].level || 1, xp: input[key].xp || 0 };
  });
  return base;
}

function goal(id, title, reason, priority, steps) {
  return { id, title, reason, priority, status: 'open', steps: steps.map(step => ({ ...step, done: false })) };
}

function buildDailyGoals(state = {}, world = {}, risk = null) {
  const goals = [];
  const food = world.storage?.food ?? 0;
  const well = world.well?.water_level ?? 0;
  const east = world.fields?.east || {};
  const west = world.fields?.west || {};
  const animals = world.animals || {};
  const house = world.house || {};
  const motorcycle = world.motorcycle || {};

  if ((risk?.overall || 0) >= 70 && risk.topRisk?.task) {
    goals.push(goal('control_risk', 'Control the biggest risk', risk.summary, 95, [risk.topRisk.task]));
  }

  if (food <= 3) {
    goals.push(goal('secure_food', 'Secure food for the day', 'food reserves are low', 90, [
      { label: 'Find Food', action: 'fishing', location: 'fishing_spot', duration: 35, reason: 'food reserve is low' },
      { label: 'Eat if Needed', action: 'eating', location: 'table', duration: 20, reason: 'keep body steady' }
    ]));
  }

  const dryField = east.moisture <= west.moisture ? { key: 'east', field: east, location: 'east_field' } : { key: 'west', field: west, location: 'west_field' };
  if ((dryField.field.moisture ?? 100) <= 45 && well > 10) {
    goals.push(goal('protect_crops', 'Protect the crops', `${dryField.field.label || dryField.key} needs attention`, 82, [
      { label: 'Water Vulnerable Field', action: 'watering_crops', location: dryField.location, duration: 30, reason: 'field may dry out' },
      { label: 'Tend Crop Rows', action: 'tending_crops', location: dryField.location, duration: 30, reason: 'keep crop health stable' }
    ]));
  }

  const readyField = east.growth >= west.growth ? { key: 'east', field: east, location: 'east_field' } : { key: 'west', field: west, location: 'west_field' };
  if ((readyField.field.growth ?? 0) >= 78) {
    goals.push(goal('harvest_ready', 'Harvest ready crops', `${readyField.field.label || readyField.key} is near harvest`, 78, [
      { label: 'Harvest Ready Crops', action: 'harvesting', location: readyField.location, duration: 40, reason: 'crops are ready' }
    ]));
  }

  if ((animals.hunger ?? 0) >= 65 || (animals.health ?? 100) <= 55) {
    goals.push(goal('care_animals', 'Care for the animals', 'animals need attention', 74, [
      { label: 'Feed Animals', action: 'tending_animals', location: 'fence_north', duration: 25, reason: 'animals need care' }
    ]));
  }

  if ((house.cleanliness ?? 100) <= 35) {
    goals.push(goal('keep_home_livable', 'Keep home livable', 'house is getting dirty', 56, [
      { label: 'Clean The House', action: 'sitting', location: 'home', duration: 25, reason: 'home needs care' }
    ]));
  }

  if ((motorcycle.condition ?? 100) <= 45) {
    goals.push(goal('maintain_tools', 'Maintain important tools', 'motorcycle may become unreliable', 52, [
      { label: 'Repair Motorcycle', action: 'checking_motorcycle', location: 'motorcycle', duration: 25, reason: 'motorcycle needs maintenance' }
    ]));
  }

  goals.push(goal('stay_steady', 'Stay steady and healthy', 'body must last through the day', 50, [
    { label: 'Eat if Hungry', action: 'eating', location: 'table', duration: 20, reason: 'keep hunger under control' },
    { label: 'Rest Before Night', action: 'sitting', location: 'bed', duration: 25, reason: 'save energy for tomorrow' }
  ]));

  return goals.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

function mergeGoalProgress(freshGoals, oldGoals = []) {
  return freshGoals.map(fresh => {
    const old = oldGoals.find(g => g.id === fresh.id);
    if (!old) return fresh;
    const steps = fresh.steps.map(step => {
      const oldStep = (old.steps || []).find(s => s.action === step.action && s.location === step.location && s.done);
      return oldStep ? { ...step, done: true, completed_at: oldStep.completed_at } : step;
    });
    const done = steps.length > 0 && steps.every(step => step.done);
    return { ...fresh, steps, status: done ? 'done' : old.status === 'done' ? 'done' : fresh.status, completed_at: old.completed_at };
  });
}

function ensureDailyPlan(state = {}, world = {}, risk = null) {
  const day = state.day || 1;
  const current = state.daily_plan;
  const freshGoals = buildDailyGoals(state, world, risk);
  const hasRiskGoal = current?.goals?.some(g => g.id === 'control_risk');
  const hasCropGoal = current?.goals?.some(g => g.id === 'protect_crops');
  const needsRefresh = !current ||
    current.day !== day ||
    current.version !== 2 ||
    !Array.isArray(current.goals) ||
    current.goals.length < Math.min(2, freshGoals.length) ||
    ((risk?.overall || 0) >= 70 && !hasRiskGoal) ||
    (freshGoals.some(g => g.id === 'protect_crops') && !hasCropGoal);

  if (!needsRefresh) return state;

  return {
    ...state,
    daily_plan: {
      day,
      version: 2,
      created_at: current?.created_at || state.world_time || '06:00',
      refreshed_at: current ? state.world_time || '06:00' : null,
      goals: mergeGoalProgress(freshGoals, current?.goals || []),
      reflections: current?.reflections || []
    }
  };
}

function chooseGoalTask(state = {}, minute = 360) {
  const plan = state.daily_plan;
  if (!plan?.goals?.length) return null;
  if (minute < 6 * 60 || minute >= 21 * 60) return null;
  if ((state.energy ?? 80) < 22 || (state.hunger ?? 20) > 78) return null;

  for (const item of plan.goals) {
    if (item.status === 'done') continue;
    const step = item.steps?.find(s => !s.done);
    if (!step) continue;
    return {
      ...step,
      source: 'goal',
      goal_id: item.id,
      goal_title: item.title,
      reason: step.reason || item.reason || 'daily goal'
    };
  }
  return null;
}

function completeGoalStep(state = {}, action, location) {
  const plan = state.daily_plan;
  if (!plan?.goals?.length || !action) return state;
  let changed = false;
  const goals = plan.goals.map(goalItem => {
    let goalChanged = false;
    const steps = (goalItem.steps || []).map(step => {
      if (!step.done && step.action === action && (!step.location || step.location === location)) {
        changed = true;
        goalChanged = true;
        return { ...step, done: true, completed_at: state.world_time || null };
      }
      return step;
    });
    const done = steps.length > 0 && steps.every(step => step.done);
    return { ...goalItem, steps, status: done ? 'done' : goalItem.status, completed_at: done && goalChanged ? state.world_time || null : goalItem.completed_at };
  });
  if (!changed) return state;
  return { ...state, daily_plan: { ...plan, goals } };
}

function skillForAction(action) {
  if (['watering_crops', 'harvesting', 'tending_crops'].includes(action)) return 'farming';
  if (action === 'tending_animals') return 'animals';
  if (action === 'checking_motorcycle' || action === 'chopping_wood') return 'repair';
  if (action === 'eating') return 'cooking';
  if (action === 'fishing' || action === 'running_to_shelter' || action === 'sleeping') return 'survival';
  return null;
}

function recordSkillProgress(state = {}, action) {
  const key = skillForAction(action);
  if (!key) return state;
  const skills = defaultSkills(state.skills);
  const current = skills[key];
  const xp = current.xp + 8;
  const nextLevel = Math.min(10, current.level + Math.floor(xp / 100));
  skills[key] = { level: nextLevel, xp: xp % 100 };
  return { ...state, skills };
}

function buildNightReflection(state = {}, world = {}, risk = null) {
  const plan = state.daily_plan;
  if (!plan || plan.reflected_day === state.day) return null;
  const goals = plan.goals || [];
  const done = goals.filter(g => g.status === 'done').length;
  const open = goals.length - done;
  const topRisk = risk?.topRisk?.label || 'no major risk';
  const food = world.storage?.food ?? 0;
  const energy = Math.round(state.energy ?? 0);
  return {
    text: `Day ${state.day}: Arash finished ${done} daily goal(s), left ${open} open, ended with ${energy}% energy, ${food} food, and ${topRisk}.`,
    importance: open > 1 || (risk?.overall || 0) > 70 ? 8 : 6,
    state: { ...state, daily_plan: { ...plan, reflected_day: state.day, reflections: [...(plan.reflections || []), { time: state.world_time, done, open, topRisk }] } }
  };
}

function maybeCreateWorldEvent(state = {}, world = {}, risk = null, weather = 'sunny') {
  const day = state.day || 1;
  const minute = parseMinutes(state.world_time);
  const last = state.last_world_event_key;
  if (minute < 7 * 60 || minute > 19 * 60) return null;
  if (last === `${day}:${Math.floor(minute / 120)}`) return null;
  if (minute % 120 > 2) return null;

  const events = [];
  if (weather === 'stormy') events.push({ id: 'storm_damage', title: 'Storm strain', note: 'The storm made the farm feel unsafe.', severity: 70 });
  if ((world.animals?.produce ?? 0) >= 4) events.push({ id: 'animal_produce', title: 'Animal produce ready', note: 'The animals have produced something useful.', severity: 45 });
  if ((risk?.overall ?? 0) >= 75) events.push({ id: 'pressure_day', title: 'Pressure is rising', note: risk.summary, severity: risk.overall });
  if ((world.fields?.east?.growth ?? 0) >= 90 || (world.fields?.west?.growth ?? 0) >= 90) events.push({ id: 'ripe_fields', title: 'Ripe fields', note: 'Some crops look ready and should not wait too long.', severity: 62 });
  if (!events.length) return null;

  const event = events.sort((a, b) => b.severity - a.severity)[0];
  return {
    event,
    state: {
      ...state,
      last_world_event_key: `${day}:${Math.floor(minute / 120)}`,
      world_events: [event, ...(state.world_events || [])].slice(0, 8)
    }
  };
}

module.exports = {
  ensureDailyPlan,
  chooseGoalTask,
  completeGoalStep,
  recordSkillProgress,
  buildNightReflection,
  maybeCreateWorldEvent,
  defaultSkills,
  skillLevel
};
