function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function parseMinutes(time) {
  const [h = 0, m = 0] = String(time || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function absoluteMinute(day, worldTime) {
  return ((day || 1) - 1) * 1440 + parseMinutes(worldTime);
}

function defaultAidaSkills(input = {}) {
  const base = {
    gardening: { level: 1, xp: 0 },
    herbs: { level: 1, xp: 0 },
    animals: { level: 1, xp: 0 },
    cooking: { level: 1, xp: 0 },
    social: { level: 1, xp: 0 },
    resilience: { level: 1, xp: 0 }
  };
  Object.keys(base).forEach(key => {
    if (input[key]) base[key] = { level: input[key].level || 1, xp: input[key].xp || 0 };
  });
  return base;
}

function defaultAidaWorld(input = {}) {
  return {
    garden: {
      moisture: clamp(input.garden?.moisture ?? 54),
      growth: clamp(input.garden?.growth ?? 36),
      health: clamp(input.garden?.health ?? 84)
    },
    herbs: {
      stock: clamp(input.herbs?.stock ?? 8, 0, 999),
      drying: clamp(input.herbs?.drying ?? 28),
      knowledge: clamp(input.herbs?.knowledge ?? 18)
    },
    home: {
      cleanliness: clamp(input.home?.cleanliness ?? 78),
      warmth: clamp(input.home?.warmth ?? 70)
    },
    animals: {
      hunger: clamp(input.animals?.hunger ?? 34),
      health: clamp(input.animals?.health ?? 86),
      trust: clamp(input.animals?.trust ?? 45)
    },
    supplies: {
      food: clamp(input.supplies?.food ?? 8, 0, 999),
      herbs: clamp(input.supplies?.herbs ?? 6, 0, 999),
      thread: clamp(input.supplies?.thread ?? 4, 0, 999)
    },
    social: {
      arash_bond: clamp(input.social?.arash_bond ?? 28),
      village_familiarity: clamp(input.social?.village_familiarity ?? 20)
    }
  };
}

function ensureAidaMind(state = {}) {
  return {
    ...state,
    skills: defaultAidaSkills(state.skills),
    aida_world: defaultAidaWorld(state.aida_world),
    short_memory: Array.isArray(state.short_memory) ? state.short_memory.slice(-8) : [],
    world_events: Array.isArray(state.world_events) ? state.world_events.slice(0, 8) : []
  };
}

function addShortMemory(state, text, worldTime) {
  if (!text) return state;
  const item = { text, time: worldTime || state.world_time || null };
  return { ...state, short_memory: [item, ...(state.short_memory || [])].slice(0, 8) };
}

function addWorldEvent(state, event) {
  if (!event) return state;
  return { ...state, world_events: [event, ...(state.world_events || [])].slice(0, 8) };
}

function skillForAction(action) {
  if (['morning_garden', 'watering_garden', 'shared_path_garden'].includes(action)) return 'gardening';
  if (['checking_herbs', 'prepare_herbs'].includes(action)) return 'herbs';
  if (['animal_care'].includes(action)) return 'animals';
  if (action === 'eating') return 'cooking';
  if (['neighbor_walk', 'village_errand'].includes(action)) return 'social';
  if (['sleeping', 'resting', 'evening_prayer'].includes(action)) return 'resilience';
  return null;
}

function recordAidaSkillProgress(state, action) {
  const key = skillForAction(action);
  if (!key) return state;
  const skills = defaultAidaSkills(state.skills);
  const current = skills[key];
  const xp = current.xp + 8;
  const levelGain = Math.floor(xp / 100);
  skills[key] = { level: Math.min(10, current.level + levelGain), xp: xp % 100 };
  return { ...state, skills };
}

function applyAidaBodyNeeds(state, weather = 'sunny') {
  const action = state.current_action || 'idle';
  let energy = Number(state.energy ?? 84);
  let hunger = Number(state.hunger ?? 24);
  let mood = state.mood || 'curious';

  if (action === 'sleeping') energy += 0.45;
  else if (['resting', 'eating', 'evening_prayer'].includes(action)) energy += 0.08;
  else energy -= ['watering_garden', 'animal_care', 'shared_path_garden'].includes(action) ? 0.18 : 0.1;

  hunger += action === 'eating' ? -1.1 : action === 'sleeping' ? 0.05 : 0.12;

  if ((weather === 'stormy' || weather === 'rainy') && ['watering_garden', 'neighbor_walk', 'village_errand', 'shared_path_garden'].includes(action)) {
    energy -= weather === 'stormy' ? 0.16 : 0.08;
    mood = 'worried';
  }
  if (hunger > 82) mood = 'hungry';
  else if (energy < 24) mood = 'tired';
  else if (['morning_garden', 'checking_herbs', 'animal_care', 'shared_path_garden'].includes(action)) mood = 'focused';

  return { ...state, energy: clamp(energy, 0, 100), hunger: clamp(hunger, 0, 100), mood };
}

function applyAidaWorldDrift(state, weather = 'sunny') {
  const world = defaultAidaWorld(state.aida_world);
  const rain = weather === 'rainy' || weather === 'stormy';
  world.garden.moisture = clamp(world.garden.moisture + (rain ? 8 : weather === 'sunny' ? -4 : -2));
  world.garden.growth = clamp(world.garden.growth + (world.garden.moisture > 35 && world.garden.health > 45 ? 1.5 : 0.4));
  world.garden.health = clamp(world.garden.health + (world.garden.moisture < 18 ? -4 : world.garden.moisture > 35 ? 0.8 : -0.5));
  world.home.cleanliness = clamp(world.home.cleanliness - 0.8);
  world.home.warmth = clamp(world.home.warmth + (weather === 'stormy' ? -1.2 : -0.2));
  world.animals.hunger = clamp(world.animals.hunger + 3.2);
  world.animals.health = clamp(world.animals.health + (world.animals.hunger > 78 ? -2.8 : 0.6));
  world.herbs.drying = clamp(world.herbs.drying + (weather === 'sunny' ? 2 : rain ? -1 : 1));
  return { ...state, aida_world: world };
}

function makeTask(label, action, location, duration, reason, priority = 60, source = 'need') {
  return { label, action, location, duration, reason, priority, source };
}

function buildAidaRiskProfile(state = {}, weather = 'sunny', minute = 360) {
  const s = ensureAidaMind(state);
  const world = defaultAidaWorld(s.aida_world);
  const risks = [];
  function add(id, label, severity, reason, task = null) {
    risks.push({ id, label, severity: clamp(severity), reason, task });
  }

  if ((s.energy ?? 80) <= 14) add('exhaustion', 'Exhaustion', 94, 'Aida is too tired to work well', makeTask('Sleep Before Collapse', 'sleeping', 'home_bed', 80, 'energy is dangerously low', 96));
  else if ((s.energy ?? 80) <= 26) add('fatigue', 'Fatigue', 74, 'Aida needs a quiet rest', makeTask('Quiet Rest', 'resting', 'home', 30, 'energy is low', 74));

  if ((s.hunger ?? 20) >= 86 && world.supplies.food > 0) add('hunger', 'Hunger', 88, 'hunger is distracting her', makeTask('Eat at Home', 'eating', 'home_table', 22, 'hunger is high', 88));
  if (world.garden.moisture <= 20) add('garden_dry', 'Garden drying', 84, 'her garden needs water', makeTask('Water Aida Garden', 'watering_garden', 'garden', 30, 'garden is drying out', 84));
  if (world.garden.health <= 45) add('garden_weak', 'Garden health risk', 80, 'plants look weak', makeTask('Tend Weak Herbs', 'morning_garden', 'garden', 30, 'garden health is weak', 80));
  if (world.animals.hunger >= 78) add('animal_hunger', 'Animals hungry', 82, 'small animals need feed', makeTask('Feed Small Animals', 'animal_care', 'barn', 28, 'animals are hungry', 82));
  if (world.animals.health <= 48) add('animal_health', 'Animal care needed', 78, 'animals need attention', makeTask('Care for Small Animals', 'animal_care', 'barn', 32, 'animals need care', 78));
  if (world.home.cleanliness <= 32) add('home_dirty', 'Home getting untidy', 58, 'her home needs care', makeTask('Tidy Aida Home', 'resting', 'home', 25, 'home needs care', 58));
  if (world.herbs.drying >= 80) add('herbs_ready', 'Herbs ready', 64, 'dried herbs should be sorted', makeTask('Sort Dried Herbs', 'checking_herbs', 'herb_workbench', 30, 'herbs are ready to sort', 64));
  if ((weather === 'stormy' || weather === 'rainy') && ['neighbor_walk', 'village_errand', 'shared_path_garden'].includes(s.current_action)) add('weather_exposure', 'Weather exposure', weather === 'stormy' ? 88 : 68, 'bad weather makes walking risky', makeTask('Return Home', 'resting', 'home', 20, 'bad weather outside', weather === 'stormy' ? 88 : 68));
  if (minute >= 17 * 60 && minute < 18 * 60 + 30 && (s.relationship_arash ?? 28) < 55) add('social_opportunity', 'Social opportunity', 42, 'an evening shared task could build trust with Arash', makeTask('Shared Path Garden', 'shared_path_garden', 'arash_path', 35, 'build trust with Arash', 42, 'social'));

  risks.sort((a, b) => b.severity - a.severity);
  const topRisk = risks[0] || null;
  const overall = topRisk ? topRisk.severity : 0;
  const mode = overall >= 88 ? 'critical' : overall >= 72 ? 'urgent' : overall >= 50 ? 'watching' : 'stable';
  return { overall, mode, topRisk, risks: risks.slice(0, 8), summary: topRisk ? `${topRisk.label}: ${topRisk.reason}` : 'Aida has no major risk right now.' };
}

function goal(id, title, reason, priority, steps) {
  return { id, title, reason, priority, status: 'open', steps: steps.map(step => ({ ...step, done: false })) };
}

function buildAidaGoals(state = {}, risk = null) {
  const s = ensureAidaMind(state);
  const w = defaultAidaWorld(s.aida_world);
  const goals = [];
  if ((risk?.overall || 0) >= 72 && risk.topRisk?.task) goals.push(goal('control_risk', 'Control Aida biggest risk', risk.summary, 95, [risk.topRisk.task]));
  if (w.garden.moisture <= 45 || w.garden.health <= 65) goals.push(goal('care_garden', 'Care for Aida garden', 'her herbs and vegetables need attention', 84, [makeTask('Water Garden', 'watering_garden', 'garden', 30, 'garden needs moisture', 78), makeTask('Check Herb Rows', 'morning_garden', 'garden', 28, 'keep herbs healthy', 70)]));
  if (w.animals.hunger >= 55 || w.animals.health <= 70) goals.push(goal('care_animals', 'Care for small animals', 'animals should trust and stay healthy', 78, [makeTask('Animal Care', 'animal_care', 'barn', 30, 'animals need care', 76)]));
  if (w.herbs.drying >= 45 || w.herbs.stock < 5) goals.push(goal('prepare_herbs', 'Prepare useful herbs', 'herbal work is Aida main skill', 70, [makeTask('Sort Herbs', 'checking_herbs', 'herb_workbench', 30, 'prepare herbs', 68)]));
  goals.push(goal('stay_well', 'Stay steady and human', 'body and home must stay calm', 54, [makeTask('Eat if Hungry', 'eating', 'home_table', 20, 'keep hunger steady', 52), makeTask('Quiet Rest', 'resting', 'home', 25, 'save energy', 50)]));
  if ((s.relationship_arash ?? 28) < 60) goals.push(goal('know_arash', 'Know Arash slowly', 'neighbor trust should grow through ordinary work', 46, [makeTask('Evening Shared Path Work', 'shared_path_garden', 'arash_path', 35, 'small shared work with Arash', 46, 'social')]));
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
    return { ...fresh, steps, status: done ? 'done' : fresh.status, completed_at: old.completed_at };
  });
}

function ensureAidaDailyPlan(state = {}, risk = null, worldTime = '06:00', day = 1) {
  const s = ensureAidaMind(state);
  const freshGoals = buildAidaGoals(s, risk);
  const current = s.daily_plan;
  const needsRefresh = !current || current.day !== day || current.version !== 1 || !Array.isArray(current.goals) || current.goals.length < 2 || ((risk?.overall || 0) >= 72 && !current.goals.some(g => g.id === 'control_risk'));
  if (!needsRefresh) return s;
  return {
    ...s,
    daily_plan: {
      day,
      version: 1,
      created_at: current?.created_at || worldTime,
      refreshed_at: current ? worldTime : null,
      goals: mergeGoalProgress(freshGoals, current?.goals || []),
      reflections: current?.reflections || []
    }
  };
}

function chooseAidaGoalTask(state = {}, minute = 360) {
  const plan = state.daily_plan;
  if (!plan?.goals?.length) return null;
  if (minute < 6 * 60 || minute >= 21 * 60) return null;
  if ((state.energy ?? 80) < 24 || (state.hunger ?? 20) > 82) return null;
  for (const item of plan.goals) {
    if (item.status === 'done') continue;
    const step = item.steps?.find(s => !s.done);
    if (!step) continue;
    return { ...step, source: step.source || 'goal', goal_id: item.id, goal_title: item.title, reason: step.reason || item.reason || 'daily goal' };
  }
  return null;
}

function completeAidaGoalStep(state = {}, action, location, worldTime) {
  const plan = state.daily_plan;
  if (!plan?.goals?.length || !action) return state;
  let changed = false;
  const goals = plan.goals.map(goalItem => {
    let goalChanged = false;
    const steps = (goalItem.steps || []).map(step => {
      if (!step.done && step.action === action && (!step.location || step.location === location)) {
        changed = true;
        goalChanged = true;
        return { ...step, done: true, completed_at: worldTime || null };
      }
      return step;
    });
    const done = steps.length > 0 && steps.every(step => step.done);
    return { ...goalItem, steps, status: done ? 'done' : goalItem.status, completed_at: done && goalChanged ? worldTime || null : goalItem.completed_at };
  });
  return changed ? { ...state, daily_plan: { ...plan, goals } } : state;
}

function applyAidaActionConsequences(state = {}, action, location, weather = 'sunny', worldTime = '06:00') {
  let s = ensureAidaMind(state);
  const world = defaultAidaWorld(s.aida_world);
  const notes = [];
  let success = true;

  if (action === 'watering_garden' || action === 'shared_path_garden') {
    world.garden.moisture = clamp(world.garden.moisture + (weather === 'sunny' ? 28 : 18));
    world.garden.health = clamp(world.garden.health + 4);
    notes.push('garden watered');
  }
  if (action === 'morning_garden' || action === 'shared_path_garden') {
    world.garden.health = clamp(world.garden.health + 8);
    world.garden.growth = clamp(world.garden.growth + 4);
    world.herbs.knowledge = clamp(world.herbs.knowledge + 2);
    notes.push('herbs tended');
  }
  if (action === 'checking_herbs') {
    const gained = world.herbs.drying >= 55 ? 2 : 1;
    world.herbs.stock = clamp(world.herbs.stock + gained, 0, 999);
    world.supplies.herbs = clamp(world.supplies.herbs + gained, 0, 999);
    world.herbs.drying = clamp(world.herbs.drying - 22);
    world.herbs.knowledge = clamp(world.herbs.knowledge + 3);
    notes.push(`prepared ${gained} herbs`);
  }
  if (action === 'animal_care') {
    if (world.supplies.food > 0) {
      world.supplies.food = clamp(world.supplies.food - 1, 0, 999);
      world.animals.hunger = clamp(world.animals.hunger - 30);
      notes.push('fed small animals');
    } else {
      world.animals.hunger = clamp(world.animals.hunger - 8);
      success = false;
      notes.push('comforted animals without feed');
    }
    world.animals.health = clamp(world.animals.health + 8);
    world.animals.trust = clamp(world.animals.trust + 5);
  }
  if (action === 'village_errand') {
    world.supplies.food = clamp(world.supplies.food + 1, 0, 999);
    world.supplies.thread = clamp(world.supplies.thread + 1, 0, 999);
    world.social.village_familiarity = clamp(world.social.village_familiarity + 4);
    notes.push('returned with small supplies');
  }
  if (action === 'eating') {
    if (world.supplies.food > 0) {
      world.supplies.food = clamp(world.supplies.food - 1, 0, 999);
      s.hunger = clamp((s.hunger || 0) - 20);
      notes.push('ate at home');
    } else {
      success = false;
      notes.push('no food at home');
    }
  }
  if (action === 'resting' || action === 'evening_prayer') {
    world.home.cleanliness = clamp(world.home.cleanliness + 4);
    world.home.warmth = clamp(world.home.warmth + 3);
    notes.push('home felt calmer');
  }
  if (action === 'sleeping') notes.push('rested at home');
  if (action === 'neighbor_walk') {
    world.social.arash_bond = clamp(world.social.arash_bond + 1);
    notes.push('noticed Arash road');
  }
  if (action === 'shared_path_garden') {
    world.social.arash_bond = clamp(world.social.arash_bond + 4);
    s.relationship_arash = clamp((s.relationship_arash || 28) + 3);
    notes.push('shared work with Arash');
  }

  s = recordAidaSkillProgress({ ...s, aida_world: world }, action);
  s = completeAidaGoalStep(s, action, location, worldTime);
  return { state: s, outcome: { action, success, notes } };
}

function buildAidaReflection(state = {}, risk = null, worldTime = '21:45', day = 1) {
  const plan = state.daily_plan;
  if (!plan || plan.reflected_day === day) return null;
  const goals = plan.goals || [];
  const done = goals.filter(g => g.status === 'done').length;
  const open = goals.length - done;
  const topRisk = risk?.topRisk?.label || 'no major risk';
  const text = `Day ${day}: Aida completed ${done} goal(s), left ${open} open, and ended the day with ${topRisk}.`;
  return {
    text,
    importance: open > 1 || (risk?.overall || 0) > 70 ? 8 : 6,
    state: { ...state, daily_plan: { ...plan, reflected_day: day, reflections: [...(plan.reflections || []), { time: worldTime, done, open, topRisk }] } }
  };
}

function maybeCreateAidaWorldEvent(state = {}, risk = null, weather = 'sunny', worldTime = '06:00', day = 1) {
  const minute = parseMinutes(worldTime);
  if (minute < 7 * 60 || minute > 20 * 60) return null;
  const key = `${day}:${Math.floor(minute / 180)}`;
  if (state.last_aida_event_key === key || minute % 180 > 2) return null;
  const w = defaultAidaWorld(state.aida_world);
  const events = [];
  if (w.garden.growth >= 85) events.push({ id: 'aida_garden_ready', title: 'Aida garden is flourishing', note: 'Some herbs look ready for careful harvest.', severity: 58 });
  if (w.animals.trust >= 75) events.push({ id: 'aida_animals_trust', title: 'Animals trust Aida', note: 'The small animals approach Aida more easily now.', severity: 42 });
  if ((risk?.overall || 0) >= 75) events.push({ id: 'aida_pressure', title: 'Aida pressure is rising', note: risk.summary, severity: risk.overall });
  if (weather === 'stormy') events.push({ id: 'aida_storm', title: 'Storm over Aida homestead', note: 'The storm makes her home feel smaller and more fragile.', severity: 64 });
  if (!events.length) return null;
  const event = events.sort((a, b) => b.severity - a.severity)[0];
  return { event, state: addWorldEvent({ ...state, last_aida_event_key: key }, event) };
}

module.exports = {
  parseMinutes,
  absoluteMinute,
  defaultAidaSkills,
  defaultAidaWorld,
  ensureAidaMind,
  addShortMemory,
  applyAidaBodyNeeds,
  applyAidaWorldDrift,
  buildAidaRiskProfile,
  ensureAidaDailyPlan,
  chooseAidaGoalTask,
  applyAidaActionConsequences,
  buildAidaReflection,
  maybeCreateAidaWorldEvent,
  makeTask
};
