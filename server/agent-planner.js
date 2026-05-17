const { callAIModel, extractJSON, VALID_ACTIONS, LOCATIONS } = require('./ai');
const { buildRuralRhythmContext, fitPlanToRuralRhythm } = require('./life-rhythm');

const ARASH_ACTIONS = Array.isArray(VALID_ACTIONS) && VALID_ACTIONS.length > 0
  ? VALID_ACTIONS
  : ['idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting', 'eating', 'sleeping', 'running_to_shelter', 'sitting', 'fishing', 'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'];

const ARASH_LOCATIONS = Object.keys(LOCATIONS || {}).length > 0
  ? Object.keys(LOCATIONS)
  : ['home', 'bed', 'table', 'east_field', 'west_field', 'well', 'wood_stump', 'haystack', 'path_center', 'fishing_spot', 'motorcycle', 'fence_north'];

const AIDA_ACTIONS = [
  'idle', 'walking', 'sitting', 'wandering', 'eating', 'sleeping', 'running_to_shelter',
  'morning_garden', 'checking_herbs', 'village_errand', 'resting', 'animal_care',
  'evening_prayer', 'watering_garden', 'shared_path_garden', 'neighbor_walk',
  'tending_animals', 'tending_crops', 'watering_crops'
];

const AIDA_LOCATIONS = [
  'home', 'home_bed', 'home_table', 'herb_workbench', 'garden', 'well', 'barn',
  'field', 'village_square', 'prayer_house', 'arash_path'
];

function getValidActions(characterName) { return characterName === 'aida' ? AIDA_ACTIONS : ARASH_ACTIONS; }
function getValidLocations(characterName) { return characterName === 'aida' ? AIDA_LOCATIONS : ARASH_LOCATIONS; }
function getDefaultAction(characterName) { return characterName === 'aida' ? 'resting' : 'wandering'; }
function getDefaultLocation(characterName) { return characterName === 'aida' ? 'home' : 'path_center'; }
function isValidAction(characterName, action) { return getValidActions(characterName).includes(action); }
function isValidLocation(characterName, location) { return getValidLocations(characterName).includes(location); }

function normalizePlan(parsed = {}, characterName = 'arash') {
  const defAction = getDefaultAction(characterName);
  const defLocation = getDefaultLocation(characterName);
  const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step, idx) => {
    let action = step.action;
    if (!isValidAction(characterName, action)) {
      console.warn(`[Planner:${characterName}] normalized invalid action "${action}" -> "${defAction}"`);
      action = defAction;
    }
    let location = step.location;
    if (!isValidLocation(characterName, location)) {
      console.warn(`[Planner:${characterName}] normalized invalid location "${location}" -> "${defLocation}"`);
      location = defLocation;
    }
    return {
      id: step.id || `step_${idx + 1}`,
      action,
      location,
      reason: step.reason || 'No specific reason given',
      expected_result: step.expected_result || '',
      status: 'pending'
    };
  }) : [];

  return {
    character: characterName,
    active_goal: parsed.active_goal || 'none',
    plan_reason: parsed.plan_reason || 'AI provided no reason',
    status: 'active',
    steps,
    should_replan_if: Array.isArray(parsed.should_replan_if) ? parsed.should_replan_if : [],
    memory: parsed.memory || null,
    importance: Math.max(1, Math.min(10, Number(parsed.importance) || 5)),
    created_at_time: null
  };
}

function fallbackPlan(characterName, state = {}, worldState = {}, goals = []) {
  const rhythm = buildRuralRhythmContext(characterName, state, worldState, state.weather || 'sunny');
  const action = rhythm.shouldSleep ? 'sleeping' : rhythm.shouldEat ? 'eating' : getDefaultAction(characterName);
  const location = rhythm.shouldSleep
    ? (characterName === 'aida' ? 'home_bed' : 'bed')
    : rhythm.shouldEat
      ? (characterName === 'aida' ? 'home_table' : 'table')
      : getDefaultLocation(characterName);

  return {
    character: characterName,
    active_goal: goals[0]?.id || 'none',
    plan_reason: `Fallback routine plan for ${rhythm.phase}`,
    status: 'active',
    steps: [{
      id: 'fallback_step_1',
      action,
      location,
      reason: 'Follow the believable rhythm of a rural human day',
      expected_result: 'Keep body, home, and work in balance',
      status: 'pending'
    }],
    should_replan_if: ['weather changes', 'energy is critical', 'hunger is critical', 'time of day changes'],
    memory: null,
    importance: 3,
    created_at_time: state.world_time || '08:00',
    rhythm_phase: rhythm.phase
  };
}

function describeWorldForPrompt(characterName, state = {}, worldState = {}) {
  if (characterName === 'aida') {
    return [
      `garden moisture: ${worldState.garden?.moisture ?? 50}%`,
      `garden health: ${worldState.garden?.health ?? 80}%`,
      `animal hunger: ${worldState.animals?.hunger ?? 30}%`,
      `herb stock: ${worldState.herbs?.stock ?? 5}`
    ].join('\n- ');
  }
  return [
    `east field growth: ${worldState.fields?.east?.growth || 0}%`,
    `west field growth: ${worldState.fields?.west?.growth || 0}%`,
    `food storage: ${worldState.storage?.food || 0}`,
    `well water: ${worldState.well?.water_level ?? 0}%`
  ].join('\n- ');
}

async function createPlan(characterName, characterState = {}, worldState = {}, memories = [], relationships = {}, goals = [], recentEvents = []) {
  const time = characterState.world_time || '08:00';
  const weather = characterState.weather || 'sunny';
  const validActions = getValidActions(characterName).join(', ');
  const validLocations = getValidLocations(characterName).join(', ');
  const memStr = memories.map(m => m.content || m).join(' | ') || '(none)';
  const eventStr = recentEvents.map(e => e.title || e.note || e).join(' | ') || '(none)';
  const trust = relationships?.trust ?? relationships?.arash_aida?.trust ?? 0;
  const tension = relationships?.tension ?? relationships?.arash_aida?.tension ?? 0;
  const rhythm = buildRuralRhythmContext(characterName, characterState, worldState, weather);
  const identity = characterName === 'aida'
    ? 'Aida is an independent Iranian village woman, gardener, herbalist, and animal keeper. She lives in her own homestead near Arash.'
    : 'Arash is an ordinary Iranian village farmer. He lives on his farm, cares for fields, home, animals, tools, food, and slowly learns to trust Aida.';

  const systemPrompt = `You are the long-term planner inside ${characterName}'s mind.
${identity}

Rural human rhythm rules:
- ${rhythm.summary}

Current state:
- time: ${time} | weather: ${weather}
- energy: ${characterState.energy}% | hunger: ${characterState.hunger}% | mood: ${characterState.mood}
- world: ${describeWorldForPrompt(characterName, characterState, worldState)}
- relationship trust with the other villager: ${trust}, tension: ${tension}
- goals: ${JSON.stringify((goals || []).map(g => ({ id: g.id, title: g.title, priority: g.priority })))}
- recent memories: ${memStr}
- recent events: ${eventStr}

Create a focused 2-4 step plan for ONE important goal.
The first step must fit the current rhythm phase. Do not send a tired or hungry person into optional work. At night, choose sleep unless there is a true emergency. Around meals, eating is normal. Around noon, rest is normal. Morning is best for hard outdoor work.
Return ONLY raw JSON. Reasons may be Persian or English.

VALID ACTIONS: ${validActions}
VALID LOCATIONS: ${validLocations}

JSON shape:
{"character":"${characterName}","active_goal":"goal_id","plan_reason":"why","steps":[{"id":"step_1","action":"ACTION","location":"LOCATION","reason":"why","expected_result":"what happens"}],"should_replan_if":["condition"],"memory":"short memory","importance":6}`;

  try {
    const text = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a realistic rural-life plan for ${characterName} right now.` }
    ]);
    const plan = fitPlanToRuralRhythm(characterName, normalizePlan(extractJSON(text), characterName), characterState, worldState, weather);
    plan.created_at_time = time;
    const firstStep = plan.steps[0];
    if (firstStep) console.log(`[Planner:${characterName}] Plan created | ${rhythm.phase} | ${firstStep.action} @ ${firstStep.location}`);
    return plan;
  } catch (error) {
    console.error(`[Planner:${characterName}] createPlan failed:`, error.message);
    return fallbackPlan(characterName, characterState, worldState, goals);
  }
}

function getNextPlanStep(characterName, currentPlan) {
  if (!currentPlan || currentPlan.status !== 'active') return null;
  const step = currentPlan.steps.find(s => s.status === 'pending') || null;
  if (step) console.log(`[Planner:${characterName}] next step: ${step.action} @ ${step.location} (id: ${step.id})`);
  return step;
}

function markPlanStepDone(characterName, plan, stepId) {
  if (!plan) return null;
  const steps = plan.steps.map(s => s.id === stepId ? { ...s, status: 'done' } : s);
  const allDone = steps.every(s => s.status === 'done');
  const status = allDone ? 'completed' : 'active';
  console.log(`[Planner:${characterName}] completed step: ${stepId}`);
  if (allDone) console.log(`[Planner:${characterName}] plan completed (goal: ${plan.active_goal})`);
  return { ...plan, steps, status };
}

function invalidatePlan(characterName, plan, reason) {
  if (!plan) return null;
  console.log(`[Planner:${characterName}] plan invalidated: ${reason}`);
  return { ...plan, status: 'invalidated', invalidation_reason: reason };
}

module.exports = {
  createPlan,
  getNextPlanStep,
  markPlanStepDone,
  invalidatePlan,
  fallbackPlan,
  normalizePlan,
  getValidActions,
  getValidLocations,
  getDefaultAction,
  getDefaultLocation,
  isValidAction,
  isValidLocation,
  ARASH_ACTIONS,
  ARASH_LOCATIONS,
  AIDA_ACTIONS,
  AIDA_LOCATIONS
};
