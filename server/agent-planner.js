const { callAIModel, extractJSON, VALID_ACTIONS, LOCATIONS } = require('./ai');

function normalizePlan(parsed, characterName) {
  const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step, idx) => {
    let action = step.action;
    if (!VALID_ACTIONS.includes(action)) action = 'wandering';
    let location = step.location;
    if (!LOCATIONS[location]) location = 'path_center';
    
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
    created_at_time: null // to be set by caller
  };
}

function fallbackPlan(characterName, state, worldState, goals) {
  return {
    character: characterName,
    active_goal: goals[0]?.id || 'none',
    plan_reason: 'Fallback routine plan generated',
    status: 'active',
    steps: [
      { id: 'fallback_step_1', action: 'wandering', location: 'path_center', reason: 'Fallback active', expected_result: 'Keep moving', status: 'pending' }
    ],
    should_replan_if: ['weather changes'],
    memory: null,
    importance: 3,
    created_at_time: state.world_time || '08:00'
  };
}

async function createPlan(characterName, characterState, worldState, memories, relationships, goals, recentEvents) {
  const time = characterState.world_time || '08:00';
  const weather = characterState.weather || 'sunny';

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
- farm condition: East field growth ${worldState.fields?.east?.growth || 0}, West field growth ${worldState.fields?.west?.growth || 0}
- food storage: ${worldState.storage?.food || 0}
- memories: ${memories.map(m => m.content).join(' | ')}
- relationship with Aida: Trust ${relationships?.arash_aida?.trust || 0}, Tension ${relationships?.arash_aida?.tension || 0}
- goals: ${JSON.stringify(goals)}

Create a multi-step plan for Arash to pursue one important goal.
Return only valid JSON. Do not include markdown. Reasons may be English or Persian.

Valid actions: ${VALID_ACTIONS.join(', ')}
Valid locations: ${Object.keys(LOCATIONS).join(', ')}

JSON shape:
{
  "character": "arash",
  "active_goal": "goal_id_here",
  "plan_reason": "Why this plan was made",
  "steps": [
    { "id": "step_1", "action": "", "location": "", "reason": "", "expected_result": "" }
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
- memories: ${memories.map(m => m.content).join(' | ')}
- relationship with Arash: Trust ${relationships?.arash_aida?.trust || 0}, Tension ${relationships?.arash_aida?.tension || 0}
- goals: ${JSON.stringify(goals)}

Create a multi-step plan for Aida.
Return only valid JSON. Do not include markdown. Reasons may be English or Persian.

Valid actions: ${VALID_ACTIONS.join(', ')}
Valid locations: ${Object.keys(LOCATIONS).join(', ')}

JSON shape:
{
  "character": "aida",
  "active_goal": "goal_id_here",
  "plan_reason": "Why this plan was made",
  "steps": [
    { "id": "step_1", "action": "", "location": "", "reason": "", "expected_result": "" }
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
    return plan;
  } catch (error) {
    console.error(`[Planner:${characterName}] Failed:`, error.message);
    return fallbackPlan(characterName, characterState, worldState, goals);
  }
}

function getNextPlanStep(characterName, currentPlan) {
  if (!currentPlan || currentPlan.status !== 'active') return null;
  return currentPlan.steps.find(s => s.status === 'pending') || null;
}

function markPlanStepDone(characterName, plan, stepId) {
  if (!plan) return null;
  const newPlan = { ...plan };
  const step = newPlan.steps.find(s => s.id === stepId);
  if (step) {
    step.status = 'done';
  }
  const pendingSteps = newPlan.steps.filter(s => s.status === 'pending');
  if (pendingSteps.length === 0) {
    newPlan.status = 'completed';
  }
  return newPlan;
}

function invalidatePlan(characterName, plan, reason) {
  if (!plan) return null;
  console.log(`[Planner:${characterName}] Plan invalidated. Reason: ${reason}`);
  return { ...plan, status: 'invalidated', invalidation_reason: reason };
}

module.exports = { createPlan, getNextPlanStep, markPlanStepDone, invalidatePlan, fallbackPlan, normalizePlan };
