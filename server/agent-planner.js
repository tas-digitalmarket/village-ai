const { callAIModel, extractJSON, VALID_ACTIONS, LOCATIONS } = require('./ai');

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER-SPECIFIC ACTION / LOCATION TABLES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Arash — farmer/general villager
 * Uses the global VALID_ACTIONS from ai.js plus a static fallback list.
 */
const ARASH_ACTIONS = Array.isArray(VALID_ACTIONS) && VALID_ACTIONS.length > 0
  ? VALID_ACTIONS
  : [
      'idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting',
      'eating', 'sleeping', 'running_to_shelter', 'sitting', 'fishing',
      'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'
    ];

/**
 * Arash locations — farm and village (keys from LOCATIONS in ai.js)
 */
const ARASH_LOCATIONS = Object.keys(LOCATIONS).length > 0
  ? Object.keys(LOCATIONS)
  : ['home', 'bed', 'table', 'east_field', 'west_field', 'well',
     'wood_stump', 'haystack', 'path_center', 'fishing_spot', 'motorcycle', 'fence_north'];

/**
 * Aida — botanist / animal keeper / gardener
 * Includes her unique actions PLUS generic-compatible ones.
 */
const AIDA_ACTIONS = [
  // Generic (compatible with Aida's animation/state system)
  'idle', 'walking', 'sitting', 'wandering',
  'eating', 'sleeping', 'running_to_shelter',
  // Aida-specific
  'morning_garden', 'checking_herbs', 'village_errand', 'resting',
  'animal_care', 'evening_prayer', 'watering_garden', 'shared_path_garden',
  'neighbor_walk',
  // Compatible generic actions Aida can also perform
  'tending_animals', 'tending_crops', 'watering_crops'
];

/**
 * Aida locations — her homestead and nearby village
 */
const AIDA_LOCATIONS = [
  'home', 'home_bed', 'home_table', 'herb_workbench',
  'garden', 'well', 'barn', 'field',
  'village_square', 'prayer_house', 'arash_path'
];

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC CHARACTER-AWARE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getValidActions(characterName) {
  return characterName === 'aida' ? AIDA_ACTIONS : ARASH_ACTIONS;
}

function getValidLocations(characterName) {
  return characterName === 'aida' ? AIDA_LOCATIONS : ARASH_LOCATIONS;
}

function getDefaultAction(characterName) {
  return characterName === 'aida' ? 'resting' : 'wandering';
}

function getDefaultLocation(characterName) {
  return characterName === 'aida' ? 'home' : 'path_center';
}

function isValidAction(characterName, action) {
  return getValidActions(characterName).includes(action);
}

function isValidLocation(characterName, location) {
  return getValidLocations(characterName).includes(location);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate and sanitize a raw AI-generated plan.
 * Uses character-specific valid actions and locations.
 * Invalid Aida locations → 'home', invalid Arash locations → 'path_center'.
 */
function normalizePlan(parsed, characterName) {
  const defAction   = getDefaultAction(characterName);
  const defLocation = getDefaultLocation(characterName);

  const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step, idx) => {
    let action = step.action;
    if (!isValidAction(characterName, action)) {
      console.warn(`[Planner:${characterName}] normalized invalid action "${action}" → "${defAction}"`);
      action = defAction;
    }

    let location = step.location;
    if (!isValidLocation(characterName, location)) {
      console.warn(`[Planner:${characterName}] normalized invalid location "${location}" → "${defLocation}"`);
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

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK PLAN
// ═══════════════════════════════════════════════════════════════════════════════

function fallbackPlan(characterName, state, worldState, goals) {
  return {
    character: characterName,
    active_goal: goals[0]?.id || 'none',
    plan_reason: 'Fallback routine plan — AI unavailable',
    status: 'active',
    steps: [{
      id: 'fallback_step_1',
      action: getDefaultAction(characterName),
      location: getDefaultLocation(characterName),
      reason: 'Fallback active',
      expected_result: 'Keep character occupied',
      status: 'pending'
    }],
    should_replan_if: ['weather changes', 'energy is critical'],
    memory: null,
    importance: 3,
    created_at_time: state.world_time || '08:00'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI PLAN CREATION
// ═══════════════════════════════════════════════════════════════════════════════

async function createPlan(characterName, characterState, worldState, memories, relationships, goals, recentEvents) {
  const time    = characterState.world_time || '08:00';
  const weather = characterState.weather    || 'sunny';

  const validActions    = getValidActions(characterName).join(', ');
  const validLocations  = getValidLocations(characterName).join(', ');
  const memStr          = memories.map(m => m.content || m).join(' | ') || '(none)';
  const trust           = relationships?.trust ?? relationships?.arash_aida?.trust ?? 0;
  const tension         = relationships?.tension ?? relationships?.arash_aida?.tension ?? 0;

  const systemPrompt = characterName === 'arash'
    ? `You are the long-term planner inside Arash's mind.
Arash is a human-like Iranian villager with a farm. He values hard work, solitude, and honesty.
He has a growing but cautious relationship with his neighbour Aida.

Current state:
- time: ${time}  |  weather: ${weather}
- energy: ${characterState.energy}%  |  hunger: ${characterState.hunger}%  |  mood: ${characterState.mood}
- farm: east field growth ${worldState.fields?.east?.growth || 0}%, west field growth ${worldState.fields?.west?.growth || 0}%
- food storage: ${worldState.storage?.food || 0} units
- relationship with Aida: trust ${trust}, tension ${tension}
- goals: ${JSON.stringify(goals.map(g => ({ id: g.id, title: g.title })))}
- recent memories: ${memStr}

Create a focused multi-step plan (2–4 steps) for Arash to pursue ONE important goal.
Return ONLY raw JSON (no markdown, no code fences). Reasons may be in English or Persian.

VALID ACTIONS (use ONLY these): ${validActions}
VALID LOCATIONS (use ONLY these): ${validLocations}

JSON format:
{
  "character": "arash",
  "active_goal": "goal_id",
  "plan_reason": "Why this plan",
  "steps": [
    { "id": "step_1", "action": "ACTION", "location": "LOCATION", "reason": "why", "expected_result": "what happens" }
  ],
  "should_replan_if": ["condition"],
  "memory": "Arash decided to...",
  "importance": 6
}`

    : `You are the long-term planner inside Aida's mind.
Aida is an independent Iranian villager: botanist, animal keeper, and gardener.
She lives near Arash and has her own homestead with a herb garden, small animals, and workbench.

Current state:
- time: ${time}  |  weather: ${weather}
- energy: ${characterState.energy}%  |  hunger: ${characterState.hunger}%  |  mood: ${characterState.mood}
- garden moisture: ${worldState.garden?.moisture ?? 50}%  |  garden health: ${worldState.garden?.health ?? 80}%
- animal hunger: ${worldState.animals?.hunger ?? 30}%  |  herb stock: ${worldState.herbs?.stock ?? 5}
- relationship with Arash: trust ${trust}, tension ${tension}
- goals: ${JSON.stringify(goals.map(g => ({ id: g.id, title: g.title })))}
- recent memories: ${memStr}

Create a focused multi-step plan (2–4 steps) for Aida to pursue ONE important goal.
Return ONLY raw JSON (no markdown, no code fences). Reasons may be in English or Persian.

VALID ACTIONS — use ONLY these (Aida-specific): ${validActions}
VALID LOCATIONS — use ONLY these (Aida-specific): ${validLocations}

Aida lives on her homestead. She goes to: garden, barn, herb_workbench, village_square, prayer_house.
Do NOT use Arash locations like east_field, west_field, bed, path_center, wood_stump, haystack.

JSON format:
{
  "character": "aida",
  "active_goal": "goal_id",
  "plan_reason": "Why this plan",
  "steps": [
    { "id": "step_1", "action": "ACTION", "location": "LOCATION", "reason": "why", "expected_result": "what happens" }
  ],
  "should_replan_if": ["condition"],
  "memory": "Aida decided to...",
  "importance": 6
}`;

  try {
    const text   = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Create a realistic multi-step plan for ${characterName} right now.` }
    ]);
    const parsed = extractJSON(text);
    const plan   = normalizePlan(parsed, characterName);
    plan.created_at_time = time;

    const firstStep = plan.steps[0];
    if (firstStep) {
      console.log(`[Planner:${characterName}] Plan created | goal: ${plan.active_goal} | first step: ${firstStep.action} @ ${firstStep.location}`);
    }
    return plan;
  } catch (error) {
    console.error(`[Planner:${characterName}] createPlan failed:`, error.message);
    return fallbackPlan(characterName, characterState, worldState, goals);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function getNextPlanStep(characterName, currentPlan) {
  if (!currentPlan || currentPlan.status !== 'active') return null;
  const step = currentPlan.steps.find(s => s.status === 'pending') || null;
  if (step) {
    console.log(`[Planner:${characterName}] next step: ${step.action} @ ${step.location} (id: ${step.id})`);
  }
  return step;
}

function markPlanStepDone(characterName, plan, stepId) {
  if (!plan) return null;
  const steps  = plan.steps.map(s => s.id === stepId ? { ...s, status: 'done' } : s);
  const allDone = steps.every(s => s.status === 'done');
  const status  = allDone ? 'completed' : 'active';
  console.log(`[Planner:${characterName}] completed step: ${stepId}`);
  if (allDone) console.log(`[Planner:${characterName}] plan completed (goal: ${plan.active_goal})`);
  return { ...plan, steps, status };
}

function invalidatePlan(characterName, plan, reason) {
  if (!plan) return null;
  console.log(`[Planner:${characterName}] plan invalidated: ${reason}`);
  return { ...plan, status: 'invalidated', invalidation_reason: reason };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core plan lifecycle
  createPlan,
  getNextPlanStep,
  markPlanStepDone,
  invalidatePlan,
  fallbackPlan,
  normalizePlan,
  // Character-aware helpers (used by life-brain.js and externally)
  getValidActions,
  getValidLocations,
  getDefaultAction,
  getDefaultLocation,
  isValidAction,
  isValidLocation,
  // Raw tables (for reference / testing)
  ARASH_ACTIONS,
  ARASH_LOCATIONS,
  AIDA_ACTIONS,
  AIDA_LOCATIONS
};
