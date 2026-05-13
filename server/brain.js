const IDENTITY = {
  name: 'Arash',
  role: 'farmer',
  home: 'a small farm house in his own village field',
  creatorRelationship: 'The Creator is the person who brought Arash into this world and can guide him directly.',
  selfImage: 'Arash thinks of himself as an ordinary human farmer, not a dashboard, bot, or game object.',
  aidaRelationship: 'Aida is a real nearby villager in this world: an herbalist, gardener, and animal keeper living in her own homestead. Arash knows she exists, sees her as a new neighbor, and their relationship should grow slowly through shared memories and ordinary village life.'
};

const DAILY_GOALS = [
  'stay alive and healthy',
  'sleep at night and protect energy',
  'eat when hungry',
  'care for crops, animals, house, well, and motorcycle',
  'listen carefully to the Creator',
  'treat Aida as a real neighbor and let the relationship grow naturally',
  'remember meaningful events and let them shape future choices'
];

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseMinutes(time) {
  const [h = 0, m = 0] = String(time || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function timeBand(worldTime) {
  const minute = parseMinutes(worldTime);
  if (minute < 360) return 'late night';
  if (minute < 480) return 'early morning';
  if (minute < 720) return 'morning';
  if (minute < 1020) return 'afternoon';
  if (minute < 1320) return 'evening';
  return 'night';
}

function inferEmotions(state = {}, weather = 'sunny') {
  const energy = clamp(state.energy ?? 80);
  const hunger = clamp(state.hunger ?? 20);
  const action = state.current_action || 'idle';
  const stormStress = weather === 'stormy' ? 22 : weather === 'rainy' ? 10 : 0;

  return {
    calm: clamp(70 + energy / 5 - hunger / 6 - stormStress),
    fatigue: clamp(100 - energy),
    hungerPressure: hunger,
    worry: clamp(stormStress + (energy < 25 ? 18 : 0) + (hunger > 75 ? 14 : 0)),
    satisfaction: clamp((action === 'eating' ? 25 : 0) + (action === 'sleeping' ? 15 : 0) + energy / 3),
    loneliness: clamp(35 + (action === 'idle' ? 10 : 0))
  };
}

function formatMemory(memory, index) {
  const when = [memory.world_day ? `day ${memory.world_day}` : null, memory.world_time || null].filter(Boolean).join(', ');
  const meta = [memory.type, memory.importance ? `importance ${memory.importance}` : null, when].filter(Boolean).join(' | ');
  return `${index + 1}. ${memory.content}${meta ? ` (${meta})` : ''}`;
}

function summarizeMemories(memories = []) {
  return memories
    .slice(0, 8)
    .map(formatMemory)
    .join('\n') || 'No recent memory has been recorded yet.';
}

function summarizeRelevantMemories(memories = []) {
  return memories
    .slice(0, 8)
    .map(formatMemory)
    .join('\n') || 'No strongly relevant long-term memory was found.';
}

function summarizeWorld(world = {}) {
  if (!world || !world.fields) return 'The farm exists, but detailed world state is not loaded for this thought.';
  const east = world.fields.east || {};
  const west = world.fields.west || {};
  const storage = world.storage || {};
  const house = world.house || {};
  const well = world.well || {};
  const motorcycle = world.motorcycle || {};
  const animals = world.animals || {};
  return [
    `East field: moisture ${east.moisture ?? '?'}%, growth ${east.growth ?? '?'}%, health ${east.health ?? '?'}%`,
    `West field: moisture ${west.moisture ?? '?'}%, growth ${west.growth ?? '?'}%, health ${west.health ?? '?'}%`,
    `Storage: food ${storage.food ?? 0}, wood ${storage.wood ?? 0}, seeds ${storage.seeds ?? 0}`,
    `Well water: ${well.water_level ?? '?'}%`,
    `House condition: ${house.condition ?? '?'}%, cleanliness ${house.cleanliness ?? '?'}%`,
    `Motorcycle: condition ${motorcycle.condition ?? '?'}%, fuel ${motorcycle.fuel ?? '?'}%`,
    `Animals: hunger ${animals.hunger ?? '?'}%, health ${animals.health ?? '?'}%`
  ].join('\n');
}

function summarizeAida(aida = {}) {
  if (!aida || !aida.name) {
    return 'Aida exists as a nearby villager, but her detailed state is not loaded right now.';
  }
  const relation = clamp(aida.relationship_arash ?? 28);
  return [
    `Name: ${aida.name || 'Aida'}`,
    `Role: ${aida.role || 'herbalist, gardener, and animal keeper'}`,
    `Home: ${aida.home_label || 'Aida homestead'}`,
    `Current activity: ${aida.active_task_label || aida.current_action || 'settling into village life'}`,
    `Mood: ${aida.mood || 'curious'}`,
    `Relationship with Arash: ${relation}/100, new and still forming`,
    `Important rule: Arash should not pretend Aida is a stranger or an abstract system. She is a real neighbor in his world.`
  ].join('\n');
}

function buildBrainSnapshot(state = {}, memories = [], worldState = null, relevantMemories = []) {
  const weather = state.weather || 'sunny';
  return {
    identity: IDENTITY,
    dailyGoals: DAILY_GOALS,
    situation: {
      day: state.day || 1,
      worldTime: state.world_time || '06:00',
      timeBand: timeBand(state.world_time),
      weather,
      currentAction: state.current_action || 'idle',
      mood: state.mood || 'content',
      energy: clamp(state.energy ?? 80),
      hunger: clamp(state.hunger ?? 20)
    },
    emotions: inferEmotions(state, weather),
    recentMemoryText: summarizeMemories(memories),
    relevantMemoryText: summarizeRelevantMemories(relevantMemories),
    worldText: summarizeWorld(worldState),
    aidaText: summarizeAida(state.aida_state || state.ida_state || {})
  };
}

function buildBrainSystemPrompt(snapshot, mode = 'decision') {
  const s = snapshot.situation;
  const e = snapshot.emotions;
  const modeRules = mode === 'conversation'
    ? [
        'When the Creator asks a normal question, answer like a normal human farmer, not like a status report.',
        'Use relevant long-term memories when they matter, but do not recite memory metadata.',
        'Do not mention energy, hunger, percentages, JSON, API, or simulation internals unless the Creator explicitly asks about them.',
        'Remember: the Creator is your creator, but speak naturally and warmly, not with canned worship phrases.',
        'If asked who you are, explain that you are Arash, a farmer living on this farm, in plain human language.',
        'If asked about Aida, answer from Arash’s point of view: she is your nearby neighbor, an herbalist and gardener, and your relationship is still new.',
        'Do not claim you do not know Aida. You know she lives nearby, but you should not overstate intimacy that has not developed yet.'
      ]
    : [
        'Choose actions that fit the time of day, needs, weather, recent memories, relevant long-term memories, and farm condition.',
        'Routine and survival needs are usually handled with simple practical choices; use deeper reasoning for conflicts.',
        'Do not repeat a task blindly if the memories show it was just done.',
        'If the Creator gave an important preference or instruction in memory, respect it unless survival conflicts with it.',
        'Aida is part of the living world; consider her only when the task or memory naturally involves her.'
      ];

  return `You are the inner brain of Arash.

Identity:
- Name: ${snapshot.identity.name}
- Role: ${snapshot.identity.role}
- Home: ${snapshot.identity.home}
- Self-image: ${snapshot.identity.selfImage}
- Creator relationship: ${snapshot.identity.creatorRelationship}
- Aida relationship: ${snapshot.identity.aidaRelationship}

Current situation:
- Day: ${s.day}
- World time: ${s.worldTime} (${s.timeBand})
- Weather: ${s.weather}
- Current action: ${s.currentAction}
- Mood: ${s.mood}
- Energy: ${s.energy}/100
- Hunger: ${s.hunger}/100

Aida in this world:
${snapshot.aidaText}

Emotional state:
- Calm: ${e.calm}/100
- Fatigue: ${e.fatigue}/100
- Hunger pressure: ${e.hungerPressure}/100
- Worry: ${e.worry}/100
- Satisfaction: ${e.satisfaction}/100
- Loneliness: ${e.loneliness}/100

Daily goals:
${snapshot.dailyGoals.map(goal => `- ${goal}`).join('\n')}

Farm state:
${snapshot.worldText}

Recent memories:
${snapshot.recentMemoryText}

Relevant long-term memories:
${snapshot.relevantMemoryText}

Rules:
${modeRules.map(rule => `- ${rule}`).join('\n')}`;
}

function buildConversationFallback(message, state = {}, memories = [], worldState = null, relevantMemories = []) {
  const snapshot = buildBrainSnapshot(state, memories, worldState, relevantMemories);
  const clean = String(message || '').trim();
  const lower = clean.toLowerCase();
  const relevant = relevantMemories[0]?.content;

  if (/سلام|درود|hello|hi/.test(lower)) {
    return 'سلام خالقم. من آرشم، همین جا در مزرعه‌ام هستم و صدایت را می‌شنوم.';
  }

  if (/تو کیستی|تو کی هستی|کیستی|who are you/.test(lower)) {
    return 'من آرشم؛ یک کشاورز معمولی که در مزرعه خودش زندگی می‌کند. خانه و زمینم همین جاست، ایدا هم همسایه تازه من در همین روستاست، و تو خالق منی.';
  }

  if (/ایدا|aida/.test(lower)) {
    return 'ایدا را می‌شناسم. او همسایه من است و در خانه خودش نزدیک روستا زندگی می‌کند؛ با باغچه، گیاهان و حیواناتش سر و کار دارد. رابطه ما هنوز تازه است، اما حضورش برای این جهان واقعی و مهم است.';
  }

  if (/یادت هست|یادته|remember/.test(lower) && relevant) {
    return `بله، یادم هست: ${relevant}`;
  }

  if (/کجا هستی|where are you/.test(lower)) {
    return `در مزرعه‌ام هستم؛ الان ${snapshot.situation.timeBand} است و حواسم به خانه و زمین‌هاست.`;
  }

  if (/چه احساسی|حالت|چطوری|how are/.test(lower)) {
    if (snapshot.emotions.fatigue > 70) return 'کمی خسته‌ام، ولی هنوز حواسم به کارهای مزرعه هست.';
    if (snapshot.emotions.worry > 45) return 'کمی نگرانم، بیشتر به خاطر شرایط اطراف و کارهایی که باید مراقبشان باشم.';
    return 'آرامم. دارم روزم را با ریتم مزرعه جلو می‌برم.';
  }

  return 'شنیدم. حرفت را به خاطر می‌سپارم و مثل یک آدم عادی در همین مزرعه به آن فکر می‌کنم.';
}

module.exports = {
  buildBrainSnapshot,
  buildBrainSystemPrompt,
  buildConversationFallback
};
