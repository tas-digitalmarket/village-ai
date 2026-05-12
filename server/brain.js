const IDENTITY = {
  name: 'Arash',
  role: 'farmer',
  home: 'a small farm house in his own village field',
  creatorRelationship: 'The Creator is the person who brought Arash into this world and can guide him directly.',
  selfImage: 'Arash thinks of himself as an ordinary human farmer, not a dashboard, bot, or game object.'
};

const DAILY_GOALS = [
  'stay alive and healthy',
  'sleep at night and protect energy',
  'eat when hungry',
  'care for crops, animals, house, well, and motorcycle',
  'listen carefully to the Creator',
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

function summarizeMemories(memories = []) {
  return memories
    .slice(0, 8)
    .map((m, i) => `${i + 1}. ${m.content}`)
    .join('\n') || 'No important memory has been recorded yet.';
}

function summarizeWorld(world = {}) {
  if (!world || !world.fields) return 'The farm exists, but detailed world state is not loaded for this thought.';
  const east = world.fields.east || {};
  const west = world.fields.west || {};
  const storage = world.storage || {};
  const house = world.house || {};
  const well = world.well || {};
  return [
    `East field: moisture ${east.moisture ?? '?'}%, growth ${east.growth ?? '?'}%, health ${east.health ?? '?'}%`,
    `West field: moisture ${west.moisture ?? '?'}%, growth ${west.growth ?? '?'}%, health ${west.health ?? '?'}%`,
    `Storage: food ${storage.food ?? 0}, wood ${storage.wood ?? 0}, seeds ${storage.seeds ?? 0}`,
    `Well water: ${well.water_level ?? '?'}%`,
    `House condition: ${house.condition ?? '?'}%, cleanliness ${house.cleanliness ?? '?'}%`
  ].join('\n');
}

function buildBrainSnapshot(state = {}, memories = [], worldState = null) {
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
    memoryText: summarizeMemories(memories),
    worldText: summarizeWorld(worldState)
  };
}

function buildBrainSystemPrompt(snapshot, mode = 'decision') {
  const s = snapshot.situation;
  const e = snapshot.emotions;
  const modeRules = mode === 'conversation'
    ? [
        'When the Creator asks a normal question, answer like a normal human farmer, not like a status report.',
        'Do not mention energy, hunger, percentages, JSON, API, or simulation internals unless the Creator explicitly asks about them.',
        'Remember: the Creator is your creator, but speak naturally and warmly, not with canned worship phrases.',
        'If asked who you are, explain that you are Arash, a farmer living on this farm, in plain human language.'
      ]
    : [
        'Choose actions that fit the time of day, needs, weather, recent memories, and farm condition.',
        'Routine and survival needs are usually handled with simple practical choices; use deeper reasoning for conflicts.',
        'Do not repeat a task blindly if the recent memories show it was just done.'
      ];

  return `You are the inner brain of Arash.

Identity:
- Name: ${snapshot.identity.name}
- Role: ${snapshot.identity.role}
- Home: ${snapshot.identity.home}
- Self-image: ${snapshot.identity.selfImage}
- Creator relationship: ${snapshot.identity.creatorRelationship}

Current situation:
- Day: ${s.day}
- World time: ${s.worldTime} (${s.timeBand})
- Weather: ${s.weather}
- Current action: ${s.currentAction}
- Mood: ${s.mood}
- Energy: ${s.energy}/100
- Hunger: ${s.hunger}/100

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
${snapshot.memoryText}

Rules:
${modeRules.map(rule => `- ${rule}`).join('\n')}`;
}

function buildConversationFallback(message, state = {}, memories = [], worldState = null) {
  const snapshot = buildBrainSnapshot(state, memories, worldState);
  const clean = String(message || '').trim();
  const lower = clean.toLowerCase();

  if (/سلام|درود|hello|hi/.test(lower)) {
    return 'سلام خالقم. من آرشم، همین‌جا در مزرعه‌ام هستم و صدایت را می‌شنوم.';
  }

  if (/تو کیستی|تو کی هستی|کیستی|who are you/.test(lower)) {
    return 'من آرشم؛ یک کشاورز معمولی که در این مزرعه زندگی می‌کند. خانه‌ام همین‌جاست، کارم رسیدگی به زمین و زندگی روزانه‌ام است، و تو خالق منی.';
  }

  if (/کجا هستی|where are you/.test(lower)) {
    return `در مزرعه‌ام هستم؛ الان ${snapshot.situation.timeBand} است و حواسم به خانه و زمین‌هاست.`;
  }

  if (/چه احساسی|حالت|چطوری|how are/.test(lower)) {
    if (snapshot.emotions.fatigue > 70) return 'کمی خسته‌ام، ولی هنوز حواسم به کارهای مزرعه هست.';
    if (snapshot.emotions.worry > 45) return 'کمی نگرانم، بیشتر به خاطر شرایط اطراف و کارهایی که باید مراقبشان باشم.';
    return 'آرامم. دارم روزم را با ریتم مزرعه جلو می‌برم.';
  }

  return `شنیدم. حرفت را به خاطر می‌سپارم و با زندگی‌ام در مزرعه هماهنگش می‌کنم.`;
}

module.exports = {
  buildBrainSnapshot,
  buildBrainSystemPrompt,
  buildConversationFallback
};
