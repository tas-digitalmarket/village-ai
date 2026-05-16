const { callAIModel, extractJSON, VALID_ACTIONS, LOCATIONS } = require('./ai');

// ─── Character-specific action/location tables ────────────────────────────────

const ARASH_ACTIONS = VALID_ACTIONS; // idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, running_to_shelter, sitting, fishing, tending_animals, checking_motorcycle, wandering, tending_crops

const AIDA_ACTIONS = [
  'idle', 'sleeping', 'eating', 'resting', 'walking',
  'morning_garden', 'watering_garden', 'shared_path_garden',
  'checking_herbs', 'village_errand', 'animal_care',
  'neighbor_walk', 'evening_prayer', 'running_to_shelter'
];

const ARASH_LOCATIONS = Object.keys(LOCATIONS); // home, bed, table, east_field, west_field, well, wood_stump, haystack, path_center, fishing_spot, motorcycle, fence_north, aida_home

const AIDA_LOCATIONS = [
  'home', 'home_bed', 'home_table', 'herb_workbench',
  'garden', 'well', 'barn', 'field',
  'village_square', 'prayer_house', 'arash_path'
];

function actionsFor(characterName) {
  return characterName === 'aida' ? AIDA_ACTIONS : ARASH_ACTIONS;
}

function locationsFor(characterName) {
  return characterName === 'aida' ? AIDA_LOCATIONS : ARASH_LOCATIONS;
}

function defaultActionFor(characterName) {
  return characterName === 'aida' ? 'resting' : 'wandering';
}

function defaultLocationFor(characterName) {
  return characterName === 'aida' ? 'home' : 'path_center';
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizePlan(parsed, characterName) {
  const validActions = actionsFor(characterName);
  const validLocations = locationsFor(characterName);
  const defaultAction = defaultActionFor(characterName);
  const defaultLocation = defaultLocationFor(characterName);

  const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step, idx) => {
    let action = step.action;
    if (!validActions.includes(action)) {
      console.warn(`[Planner:${characterName}] Invalid action "${action}" → "${defaultAction}"`);
      action = defaultAction;
    }
    let location = step.location;
    if (!validLocations.includes(location)) {
      console.warn(`[Planner:${characterName}] Invalid location "${location}" → "${defaultLocation}"`);
      location = defaultLocation;
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

// ─── Fallback plan ────────────────────────────────────────────────────────────

function fallbackPlan(characterName, state, worldState, goals) {
  const isAida = characterName === 'aida';
  return {
    character: characterName,
    active_goal: goals[0]?.id || 'none',
    plan_reason: 'Fallback routine plan generated',
    status: 'active',
    steps: [
      {
        id: 'fallback_step_1',
        action: isAida ? 'resting' : 'wandering',
        location: isAida ? 'home' : 'path_center',
        reason: 'Fallback active — AI unavailable',
        expected_result: 'Keep character moving',
        status: 'pending'
      }
    ],
    should_replan_if: ['weather changes', 'energy is critical'],
    memory: null,
    importance: 3,
    created_at_time: state.world_time || '08:00'
  };
}

// ─── AI plan creation ─────────────────────────────────────────────────────────

async function createPlan(characterName, characterState, worldState, memories, relationships, goals, recentEvents) {
  const time = characterState.world_time || '08:00';
  const weather = characterState.weather || 'sunny';
  const validActions = actionsFor(characterName);
  const validLocations = locationsFor(characterName);

  const systemPrompt = characterName === 'arash'
    ? `You are the long-term planner inside Arash's mind.
Arash is a human-like villager living in a small simulated village.
He has needs, memories, emotions, goals, a farm, and a growing relationship with Aida.

Consider:
- time: ${time}
- weather: ${weather}
- energy: ${characterState.energy}
- hunger: ${characterState.hunger}
- mood: ${characterState.mood}
- farm: East field growth ${worldState.fields?.east?.growth || 0}, West field growth ${worldState.fields?.west?.growth || 0}
- food storage: ${worldState.storage?.food || 0}
- memories: ${memories.map(m => m.content).join(' | ')}
- relationship with Aida: Trust ${relationships?.trust || relationships?.arash_aida?.trust || 0}, Tension ${relationships?.tension || relationships?.arash_aida?.tension || 0}
- goals: ${JSON.stringify(goals)}

Create a multi-step plan (2-4 steps) for Arash to pursue one important goal.
Return ONLY valid JSON. No markdown. Reasons may be English or Persian.

Valid actions: ${validActions.join(', ')}
Valid locations: ${validLocations.join(', ')}

JSON shape:
{
  "character": "arash",
  "active_goal": "goal_id_here",
  "plan_reason": "Why this plan was made",
  "steps": [
    { "id": "step_1", "action": "", "location": "", "reason": "", "expected_result": "" },
    { "id": "step_2", "action": "", "location": "", "reason": "", "expected_result": "" }
  ],
  "should_replan_if": ["condition 1"],
  "memory": "Arash decided to...",
  "importance": 6
}`
    : `You are the long-term planner inside Aida's mind.
Aida is a human-like villager near Arash. She has her own goals, feelings, memories, independence, animals, herb garden, and relationship with Arash.

Consider:
- time: ${time}
- weather: ${weather}
- energy: ${characterState.energy}
- hunger: ${characterState.hunger}
- mood: ${characterState.mood}
- garden moisture: ${worldState.garden?.moisture || 50}
- animal hunger: ${worldState.animals?.hunger || 30}
- herb stock: ${worldState.herbs?.stock || 5}
- memories: ${memories.map(m => m.content).join(' | ')}
- relationship with Arash: Trust ${relationships?.trust || relationships?.arash_aida?.trust || 0}, Tension ${relationships?.tension || relationships?.arash_aida?.tension || 0}
- goals: ${JSON.stringify(goals)}

Create a realistic multi-step plan (2-4 steps) for Aida to pursue one important goal.
Return ONLY valid JSON. No markdown. Reasons may be English or Persian.

Valid actions (use ONLY these): ${validActions.join(', ')}
Valid locations (use ONLY these): ${validLocations.join(', ')}

JSON shape:
{
  "character": "aida",
  "active_goal": "goal_id_here",
  "plan_reason": "Why this plan was made",
  "steps": [
    { "id": "step_1", "action": "", "location": "", "reason": "", "expected_result": "" },
    { "id": "step_2", "action": "", "location": "", "reason": "", "expected_result": "" }
  ],
  "should_replan_if": ["condition 1"],
  "memory": "Aida decided to...",
  "importance": 6
}`;

  try {
    const text = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a realistic multi-step plan for ${characterName}.` }
    ]);
    const parsed = extractJSON(text);
    const plan = normalizePlan(parsed, characterName);
    plan.created_at_time = time;
    const firstStep = plan.steps[0];
    if (firstStep) {
      console.log(`[Planner:${characterName}] Plan created for goal: ${plan.active_goal}. First step: ${firstStep.action} @ ${firstStep.location}`);
    }
    return plan;
  } catch (error) {
    console.error(`[Planner:${characterName}] createPlan failed:`, error.message);
    return fallbackPlan(characterName, characterState, worldState, goals);
  }
}

// ─── Plan management ──────────────────────────────────────────────────────────

function getNextPlanStep(characterName, currentPlan) {
  if (!currentPlan || currentPlan.status !== 'active') return null;
  const step = currentPlan.steps.find(s => s.status === 'pending') || null;
  if (step) {
    console.log(`[Planner:${characterName}] next step: ${step.action} @ ${step.location}`);
  }
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
  console.log(`[Planner:${characterName}] Plan invalidated. Reason: ${reason}`);
  return { ...plan, status: 'invalidated', invalidation_reason: reason };
}

module.exports = {
  createPlan,
  getNextPlanStep,
  markPlanStepDone,
  invalidatePlan,
  fallbackPlan,
  normalizePlan,
  AIDA_ACTIONS,
  AIDA_LOCATIONS,
  ARASH_ACTIONS,
  ARASH_LOCATIONS
};
