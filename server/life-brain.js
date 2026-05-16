const { callAIModel, extractJSON, VALID_ACTIONS, LOCATIONS } = require('./ai');
const { AIDA_ACTIONS, AIDA_LOCATIONS } = require('./agent-planner');

// ─── Character-specific helpers ───────────────────────────────────────────────

function actionsFor(characterName) {
  return characterName === 'aida' ? AIDA_ACTIONS : VALID_ACTIONS;
}

function locationsFor(characterName) {
  return characterName === 'aida' ? AIDA_LOCATIONS : Object.keys(LOCATIONS);
}

function defaultsFor(characterName) {
  return characterName === 'aida'
    ? { action: 'resting', location: 'home' }
    : { action: 'wandering', location: 'path_center' };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeLifeDecision(parsed, characterName = 'arash') {
  const validActions = actionsFor(characterName);
  const validLocations = locationsFor(characterName);
  const { action: defAction, location: defLocation } = defaultsFor(characterName);

  let action = parsed.action;
  if (!validActions.includes(action)) action = defAction;

  let location = parsed.location;
  if (!validLocations.includes(location)) location = defLocation;

  return {
    action,
    location,
    duration: Math.max(5, Math.min(90, Number(parsed.duration) || 20)),
    thought: parsed.thought || 'باید یک کاری بکنم...',
    reason: parsed.reason || 'AI provided no reason',
    emotion: parsed.emotion || 'neutral',
    goal: parsed.goal || null,
    memory: parsed.memory || null,
    should_talk_to: parsed.should_talk_to || null,
    dialogue: parsed.dialogue || null,
    importance: Math.max(1, Math.min(10, Number(parsed.importance) || 5))
  };
}

// ─── Fallback decision ────────────────────────────────────────────────────────

function fallbackLifeDecision(characterName, characterState, worldState, weather, time) {
  const hour = Number(time.split(':')[0]);
  const isAida = characterName === 'aida';

  if (hour >= 22 || hour < 6) {
    return {
      action: 'sleeping',
      location: isAida ? 'home_bed' : 'bed',
      duration: 60,
      thought: 'وقت خواب است.',
      reason: 'Night time routine',
      emotion: 'tired',
      goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 5
    };
  }
  if ((characterState.hunger || 0) > 75) {
    return {
      action: 'eating',
      location: isAida ? 'home_table' : 'table',
      duration: 25,
      thought: 'خیلی گرسنه‌ام.',
      reason: 'Hunger is high',
      emotion: 'hungry',
      goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 6
    };
  }
  if (isAida) {
    return {
      action: 'resting',
      location: 'home',
      duration: 20,
      thought: 'کمی استراحت می‌کنم.',
      reason: 'No clear immediate need',
      emotion: 'peaceful',
      goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 2
    };
  }
  return {
    action: 'wandering',
    location: 'path_center',
    duration: 20,
    thought: 'کمی قدم می‌زنم.',
    reason: 'No clear immediate need',
    emotion: 'peaceful',
    goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 2
  };
}

// ─── AI immediate decision ────────────────────────────────────────────────────

async function decideNextAction(characterName, characterState, worldState, memories, relationships, recentEvents, goals) {
  const time = characterState.world_time || '08:00';
  const weather = characterState.weather || 'sunny';
  const validActions = actionsFor(characterName);
  const validLocations = locationsFor(characterName);

  const systemPrompt = characterName === 'arash'
    ? `You are the inner decision-making mind of Arash, a human-like villager living in a small simulated village.
You are not a chatbot. You are deciding what Arash genuinely wants or needs to do next.
Do not blindly follow a fixed routine.

Consider:
- time: ${time}
- weather: ${weather}
- hunger: ${characterState.hunger}
- energy: ${characterState.energy}
- mood: ${characterState.mood}
- food storage: ${worldState.storage?.food || 0}
- goals: ${JSON.stringify(goals.map(g => g.title))}
- recent memories: ${memories.map(m => m.content).join(' | ')}
- relationship with Aida: Trust ${relationships?.trust || relationships?.arash_aida?.trust || 0}, Tension ${relationships?.tension || relationships?.arash_aida?.tension || 0}

Return ONLY valid JSON. No markdown. Thought and dialogue must be in Persian.
Valid actions: ${validActions.join(', ')}
Valid locations: ${validLocations.join(', ')}

JSON shape:
{ "action": "", "location": "", "duration": 0, "thought": "", "reason": "", "emotion": "", "goal": "", "memory": "", "should_talk_to": null, "dialogue": null, "importance": 5 }`
    : `You are the inner decision-making mind of Aida, a human-like villager who lives near Arash.
Aida is independent and has her own needs, emotions, memories, animals, and herb garden.

Consider:
- time: ${time}
- weather: ${weather}
- hunger: ${characterState.hunger}
- energy: ${characterState.energy}
- mood: ${characterState.mood}
- garden moisture: ${worldState.garden?.moisture || 50}
- animal hunger: ${worldState.animals?.hunger || 30}
- goals: ${JSON.stringify(goals.map(g => g.title))}
- recent memories: ${memories.map(m => m.content).join(' | ')}
- relationship with Arash: Trust ${relationships?.trust || relationships?.arash_aida?.trust || 0}, Tension ${relationships?.tension || relationships?.arash_aida?.tension || 0}

Return ONLY valid JSON. No markdown. Thought and dialogue must be in Persian.
Valid actions (use ONLY these): ${validActions.join(', ')}
Valid locations (use ONLY these): ${validLocations.join(', ')}

JSON shape:
{ "action": "", "location": "", "duration": 0, "thought": "", "reason": "", "emotion": "", "goal": "", "memory": "", "should_talk_to": null, "dialogue": null, "importance": 5 }`;

  try {
    const text = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Decide ${characterName}'s next immediate action based on current state.` }
    ]);
    const parsed = extractJSON(text);
    return normalizeLifeDecision(parsed, characterName);
  } catch (error) {
    console.error(`[LifeBrain:${characterName}] Failed:`, error.message);
    return fallbackLifeDecision(characterName, characterState, worldState, weather, time);
  }
}

module.exports = { decideNextAction, normalizeLifeDecision, fallbackLifeDecision };
