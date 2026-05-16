const { callAIModel, extractJSON, VALID_ACTIONS, LOCATIONS } = require('./ai');

function normalizeLifeDecision(parsed) {
  const defaultAction = 'wandering';
  const defaultLocation = 'path_center';
  
  let action = parsed.action;
  if (!VALID_ACTIONS.includes(action)) action = defaultAction;
  
  let location = parsed.location;
  if (!LOCATIONS[location]) location = defaultLocation;
  
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

function fallbackLifeDecision(characterName, characterState, worldState, weather, time) {
  const hour = Number(time.split(':')[0]);
  if (hour >= 22 || hour < 6) {
    return { action: 'sleeping', location: 'bed', duration: 60, thought: 'وقت خواب است.', reason: 'Night time routine', emotion: 'tired', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 5 };
  }
  if ((characterState.hunger || 0) > 75) {
    return { action: 'eating', location: 'table', duration: 25, thought: 'خیلی گرسنه‌ام.', reason: 'Hunger is high', emotion: 'hungry', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 6 };
  }
  return { action: 'wandering', location: 'path_center', duration: 20, thought: 'کمی قدم می‌زنم.', reason: 'No clear immediate need', emotion: 'peaceful', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 2 };
}

async function decideNextAction(characterName, characterState, worldState, memories, relationships, recentEvents, goals) {
  const time = characterState.world_time || '08:00';
  const weather = characterState.weather || 'sunny';
  
  const systemPrompt = characterName === 'arash' 
    ? `You are the inner decision-making mind of Arash, a human-like villager living in a small simulated village.
You are not a chatbot. You are deciding what Arash genuinely wants or needs to do next.
Do not blindly follow a fixed routine. Only follow habits if they make sense emotionally, physically, and contextually.

Consider:
- time: ${time}
- weather: ${weather}
- hunger: ${characterState.hunger}
- energy: ${characterState.energy}
- mood: ${characterState.mood}
- food storage: ${worldState.storage?.food || 0}
- goals: ${JSON.stringify(goals.map(g => g.title))}
- recent memories: ${memories.map(m => m.content).join(' | ')}
- relationship with aida: Trust ${relationships?.arash_aida?.trust || 0}, Tension ${relationships?.arash_aida?.tension || 0}

Return only valid JSON. Do not include markdown. The thought and dialogue should be in Persian.
Valid actions: ${VALID_ACTIONS.join(', ')}
Valid locations: ${Object.keys(LOCATIONS).join(', ')}

JSON shape:
{
  "action": "", "location": "", "duration": 0, "thought": "", "reason": "", "emotion": "", "goal": "", "memory": "", "should_talk_to": null, "dialogue": null, "importance": 5
}`
    : `You are the inner decision-making mind of Aida, a human-like villager who lives near Arash.
Aida has her own needs, emotions, memories, and goals.

Consider:
- time: ${time}
- weather: ${weather}
- hunger: ${characterState.hunger}
- energy: ${characterState.energy}
- mood: ${characterState.mood}
- goals: ${JSON.stringify(goals.map(g => g.title))}
- recent memories: ${memories.map(m => m.content).join(' | ')}
- relationship with arash: Trust ${relationships?.arash_aida?.trust || 0}, Tension ${relationships?.arash_aida?.tension || 0}

Return only valid JSON. Do not include markdown. The thought and dialogue should be in Persian.
Valid actions: ${VALID_ACTIONS.join(', ')}
Valid locations: ${Object.keys(LOCATIONS).join(', ')}

JSON shape:
{
  "action": "", "location": "", "duration": 0, "thought": "", "reason": "", "emotion": "", "goal": "", "memory": "", "should_talk_to": null, "dialogue": null, "importance": 5
}`;

  try {
    const text = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Decide ${characterName}'s next immediate action based on current state.` }
    ]);
    const parsed = extractJSON(text);
    return normalizeLifeDecision(parsed);
  } catch (error) {
    console.error(`[LifeBrain:${characterName}] Failed:`, error.message);
    return fallbackLifeDecision(characterName, characterState, worldState, weather, time);
  }
}

module.exports = { decideNextAction, normalizeLifeDecision, fallbackLifeDecision };
