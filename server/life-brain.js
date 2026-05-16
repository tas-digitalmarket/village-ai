const { callAIModel, extractJSON } = require('./ai');
const {
  getValidActions,
  getValidLocations,
  getDefaultAction,
  getDefaultLocation,
  isValidAction,
  isValidLocation
} = require('./agent-planner');

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZATION  (character-aware)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate and sanitise a raw AI immediate-decision object.
 * Invalid actions/locations are replaced with character-appropriate defaults.
 * Every change is logged so it is easy to spot AI hallucinations.
 *
 * @param {object} parsed       Raw JSON from the AI model
 * @param {string} characterName 'arash' | 'aida'
 * @returns {object}            Cleaned decision object
 */
function normalizeLifeDecision(parsed, characterName = 'arash') {
  const defAction   = getDefaultAction(characterName);
  const defLocation = getDefaultLocation(characterName);

  let action = parsed.action;
  if (!isValidAction(characterName, action)) {
    console.warn(`[LifeBrain:${characterName}] normalized invalid action "${action}" → "${defAction}"`);
    action = defAction;
  }

  let location = parsed.location;
  if (!isValidLocation(characterName, location)) {
    console.warn(`[LifeBrain:${characterName}] normalized invalid location "${location}" → "${defLocation}"`);
    location = defLocation;
  }

  return {
    action,
    location,
    duration:     Math.max(5, Math.min(90, Number(parsed.duration) || 20)),
    thought:      parsed.thought      || 'باید یک کاری بکنم...',
    reason:       parsed.reason       || 'AI provided no reason',
    emotion:      parsed.emotion      || 'neutral',
    goal:         parsed.goal         || null,
    memory:       parsed.memory       || null,
    should_talk_to: parsed.should_talk_to || null,
    dialogue:     parsed.dialogue     || null,
    importance:   Math.max(1, Math.min(10, Number(parsed.importance) || 5))
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK DECISION
// ═══════════════════════════════════════════════════════════════════════════════

function fallbackLifeDecision(characterName, characterState, worldState, weather, time) {
  const hour   = Number((time || '08:00').split(':')[0]);
  const isAida = characterName === 'aida';

  // Night → sleep
  if (hour >= 22 || hour < 6) {
    return {
      action: 'sleeping', location: isAida ? 'home_bed' : 'bed',
      duration: 60, thought: 'وقت خواب است.', reason: 'Night time',
      emotion: 'tired', goal: null, memory: null,
      should_talk_to: null, dialogue: null, importance: 5
    };
  }

  // Very hungry → eat
  if ((characterState.hunger || 0) > 75) {
    return {
      action: 'eating', location: isAida ? 'home_table' : 'table',
      duration: 25, thought: 'خیلی گرسنه‌ام.', reason: 'Hunger is high',
      emotion: 'hungry', goal: null, memory: null,
      should_talk_to: null, dialogue: null, importance: 6
    };
  }

  // Character-specific default
  return isAida
    ? { action: 'resting', location: 'home', duration: 20, thought: 'کمی استراحت می‌کنم.', reason: 'No immediate need', emotion: 'peaceful', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 2 }
    : { action: 'wandering', location: 'path_center', duration: 20, thought: 'کمی قدم می‌زنم.', reason: 'No immediate need', emotion: 'peaceful', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 2 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI IMMEDIATE DECISION
// ═══════════════════════════════════════════════════════════════════════════════

async function decideNextAction(characterName, characterState, worldState, memories, relationships, recentEvents, goals) {
  const time    = characterState.world_time || '08:00';
  const weather = characterState.weather    || 'sunny';
  const trust   = relationships?.trust ?? relationships?.arash_aida?.trust   ?? 0;
  const tension = relationships?.tension ?? relationships?.arash_aida?.tension ?? 0;
  const memStr  = memories.map(m => m.content || m).join(' | ') || '(none)';
  const goalStr = JSON.stringify((goals || []).map(g => g.title || g.id));

  const validActions   = getValidActions(characterName).join(', ');
  const validLocations = getValidLocations(characterName).join(', ');

  const systemPrompt = characterName === 'arash'
    ? `You are the inner decision-making mind of Arash, an Iranian villager with a farm.
You decide what Arash genuinely needs to do next — not a chatbot, a real inner voice.
Do NOT just follow the clock. Consider context, body needs, emotions, and world state.

State:
- time: ${time}  |  weather: ${weather}
- hunger: ${characterState.hunger}%  |  energy: ${characterState.energy}%  |  mood: ${characterState.mood}
- food storage: ${worldState.storage?.food || 0}
- goals: ${goalStr}
- recent memories: ${memStr}
- Aida relationship: trust ${trust}, tension ${tension}

Return ONLY raw JSON — no markdown, no code fences.
Thought and dialogue MUST be in Persian (Farsi).

VALID ACTIONS (use ONLY these): ${validActions}
VALID LOCATIONS (use ONLY these): ${validLocations}

JSON:
{ "action": "", "location": "", "duration": 20, "thought": "", "reason": "", "emotion": "", "goal": "", "memory": "", "should_talk_to": null, "dialogue": null, "importance": 5 }`

    : `You are the inner decision-making mind of Aida, an Iranian villager: botanist, gardener, and animal keeper.
You decide what Aida genuinely needs or wants to do next. She lives independently near Arash.
Consider her garden, animals, herbs, home, and her slowly growing relationship with Arash.

State:
- time: ${time}  |  weather: ${weather}
- hunger: ${characterState.hunger}%  |  energy: ${characterState.energy}%  |  mood: ${characterState.mood}
- garden moisture: ${worldState.garden?.moisture ?? 50}%  |  animal hunger: ${worldState.animals?.hunger ?? 30}%
- herb stock: ${worldState.herbs?.stock ?? 5}  |  home cleanliness: ${worldState.home?.cleanliness ?? 70}%
- goals: ${goalStr}
- recent memories: ${memStr}
- Arash relationship: trust ${trust}, tension ${tension}

Return ONLY raw JSON — no markdown, no code fences.
Thought and dialogue MUST be in Persian (Farsi).

VALID ACTIONS — ONLY these (Aida-specific, do not use Arash actions):
${validActions}

VALID LOCATIONS — ONLY these (Aida homestead + nearby, do not use Arash locations like east_field, path_center, wood_stump):
${validLocations}

JSON:
{ "action": "", "location": "", "duration": 20, "thought": "", "reason": "", "emotion": "", "goal": "", "memory": "", "should_talk_to": null, "dialogue": null, "importance": 5 }`;

  try {
    const text   = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Decide ${characterName}'s next immediate action.` }
    ]);
    const parsed = extractJSON(text);
    const result = normalizeLifeDecision(parsed, characterName);
    console.log(`[LifeBrain:${characterName}] decided: ${result.action} @ ${result.location}`);
    return result;
  } catch (error) {
    console.error(`[LifeBrain:${characterName}] Failed:`, error.message);
    return fallbackLifeDecision(characterName, characterState, worldState, weather, time);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = { decideNextAction, normalizeLifeDecision, fallbackLifeDecision };
