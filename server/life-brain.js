const { callAIModel, extractJSON } = require('./ai');
const {
  getValidActions,
  getValidLocations,
  getDefaultAction,
  getDefaultLocation,
  isValidAction,
  isValidLocation
} = require('./agent-planner');
const { buildRuralRhythmContext, fitDecisionToRuralRhythm } = require('./life-rhythm');

function normalizeLifeDecision(parsed = {}, characterName = 'arash') {
  const defAction = getDefaultAction(characterName);
  const defLocation = getDefaultLocation(characterName);
  let action = parsed.action;
  if (!isValidAction(characterName, action)) {
    console.warn(`[LifeBrain:${characterName}] normalized invalid action "${action}" -> "${defAction}"`);
    action = defAction;
  }
  let location = parsed.location;
  if (!isValidLocation(characterName, location)) {
    console.warn(`[LifeBrain:${characterName}] normalized invalid location "${location}" -> "${defLocation}"`);
    location = defLocation;
  }
  return {
    action,
    location,
    duration: Math.max(5, Math.min(90, Number(parsed.duration) || 20)),
    thought: parsed.thought || 'باید ببینم الان چه کاری طبیعی تر و لازم تر است.',
    reason: parsed.reason || 'AI provided no reason',
    emotion: parsed.emotion || 'neutral',
    goal: parsed.goal || null,
    memory: parsed.memory || null,
    should_talk_to: parsed.should_talk_to || null,
    dialogue: parsed.dialogue || null,
    importance: Math.max(1, Math.min(10, Number(parsed.importance) || 5))
  };
}

function fallbackLifeDecision(characterName, characterState = {}, worldState = {}, weather = 'sunny', time = '08:00') {
  const rhythm = buildRuralRhythmContext(characterName, { ...characterState, world_time: time }, worldState, weather);
  const isAida = characterName === 'aida';
  if (rhythm.shouldSleep) {
    return {
      action: 'sleeping', location: isAida ? 'home_bed' : 'bed', duration: 60,
      thought: 'وقت خواب و بازیابی بدن است.', reason: 'rural rhythm: sleep comes first',
      emotion: 'tired', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 6,
      rhythm_phase: rhythm.phase
    };
  }
  if (rhythm.shouldEat) {
    return {
      action: 'eating', location: isAida ? 'home_table' : 'table', duration: 25,
      thought: 'اول باید غذا بخورم تا روزم درست جلو برود.', reason: 'rural rhythm: meal or hunger comes first',
      emotion: 'hungry', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 6,
      rhythm_phase: rhythm.phase
    };
  }
  if (rhythm.shouldRest) {
    return {
      action: isAida ? 'resting' : 'sitting', location: isAida ? 'home' : 'bed', duration: 25,
      thought: 'کمی آرام می مانم تا بدنم برای کار بعدی آماده شود.', reason: 'rural rhythm: rest before more work',
      emotion: 'peaceful', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 4,
      rhythm_phase: rhythm.phase
    };
  }
  return isAida
    ? { action: 'morning_garden', location: 'garden', duration: 25, thought: 'به باغچه و گیاه ها سر می زنم.', reason: 'ordinary homestead work', emotion: 'focused', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 3, rhythm_phase: rhythm.phase }
    : { action: 'wandering', location: 'path_center', duration: 20, thought: 'کمی اطراف مزرعه را نگاه می کنم و کار بعدی را می سنجم.', reason: 'ordinary farm observation', emotion: 'peaceful', goal: null, memory: null, should_talk_to: null, dialogue: null, importance: 3, rhythm_phase: rhythm.phase };
}

function worldLine(characterName, worldState = {}) {
  if (characterName === 'aida') {
    return `garden moisture ${worldState.garden?.moisture ?? 50}%, garden health ${worldState.garden?.health ?? 80}%, animal hunger ${worldState.animals?.hunger ?? 30}%, herbs ${worldState.herbs?.stock ?? 5}`;
  }
  return `food ${worldState.storage?.food || 0}, east growth ${worldState.fields?.east?.growth || 0}%, west growth ${worldState.fields?.west?.growth || 0}%, well ${worldState.well?.water_level ?? 0}%`;
}

async function decideNextAction(characterName, characterState = {}, worldState = {}, memories = [], relationships = {}, recentEvents = [], goals = []) {
  const time = characterState.world_time || '08:00';
  const weather = characterState.weather || 'sunny';
  const trust = relationships?.trust ?? relationships?.arash_aida?.trust ?? 0;
  const tension = relationships?.tension ?? relationships?.arash_aida?.tension ?? 0;
  const memStr = memories.map(m => m.content || m).join(' | ') || '(none)';
  const eventStr = recentEvents.map(e => e.title || e.note || e).join(' | ') || '(none)';
  const goalStr = JSON.stringify((goals || []).map(g => g.title || g.id));
  const validActions = getValidActions(characterName).join(', ');
  const validLocations = getValidLocations(characterName).join(', ');
  const rhythm = buildRuralRhythmContext(characterName, characterState, worldState, weather);
  const identity = characterName === 'aida'
    ? 'Aida is a real rural woman: practical, warm, independent, caring for her own homestead, garden, herbs, and animals.'
    : 'Arash is a real rural farmer: practical, grounded, responsible for fields, home, animals, food, tools, and his cautious bond with Aida.';

  const systemPrompt = `You are the immediate inner decision-making mind of ${characterName}.
${identity}

Rural human rhythm:
- ${rhythm.summary}

Current state:
- time: ${time} | weather: ${weather}
- hunger: ${characterState.hunger}% | energy: ${characterState.energy}% | mood: ${characterState.mood}
- world: ${worldLine(characterName, worldState)}
- goals: ${goalStr}
- memories: ${memStr}
- events: ${eventStr}
- relationship trust: ${trust}, tension: ${tension}

Choose one immediate action. It must feel like a normal rural human choice in this moment. Do not mention percentages in thought/dialogue. At night choose sleep unless emergency. At meal times choose food when hungry. In bad weather prefer home/shelter. It is acceptable to rest or stay idle when no meaningful task is due.
Return ONLY raw JSON. thought and dialogue MUST be Persian.

VALID ACTIONS: ${validActions}
VALID LOCATIONS: ${validLocations}

JSON:
{"action":"","location":"","duration":20,"thought":"","reason":"","emotion":"","goal":"","memory":"","should_talk_to":null,"dialogue":null,"importance":5}`;

  try {
    const text = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Decide ${characterName}'s next immediate action like a real rural human.` }
    ]);
    const normalized = normalizeLifeDecision(extractJSON(text), characterName);
    const result = fitDecisionToRuralRhythm(characterName, normalized, characterState, worldState, weather);
    console.log(`[LifeBrain:${characterName}] decided: ${result.action} @ ${result.location} (${result.rhythm_phase || rhythm.phase})`);
    return result;
  } catch (error) {
    console.error(`[LifeBrain:${characterName}] Failed:`, error.message);
    return fallbackLifeDecision(characterName, characterState, worldState, weather, time);
  }
}

module.exports = { decideNextAction, normalizeLifeDecision, fallbackLifeDecision };
