const {
  OPENROUTER_API_KEY,
  SAMBANOVA_API_KEY,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SAMBANOVA_PRIMARY_MODEL,
  SAMBANOVA_FALLBACK_MODEL
} = require('./config');
const {
  getAidaState,
  saveAidaState,
  getAidaMemories,
  addAidaMemory,
  searchAidaMemories,
  getState
} = require('./database');

const AIDA_LOCATIONS = {
  home: { x: 18, z: 36 },
  home_bed: { x: 15.7, z: 34.6 },
  home_table: { x: 20.1, z: 35.1 },
  herb_workbench: { x: 20.6, z: 37.8 },
  garden: { x: 11, z: 44 },
  well: { x: 10.5, z: 40.5 },
  barn: { x: 26, z: 40.2 },
  field: { x: 24.5, z: 44.2 },
  village_square: { x: 31, z: 24 },
  prayer_house: { x: 37, z: 18.5 },
  arash_path: { x: 7, z: 16 }
};

const ROUTINE = [
  { from: 0, to: 6 * 60, action: 'sleeping', label: 'Sleeping in her home', location: 'home_bed', mood: 'tired' },
  { from: 6 * 60, to: 7 * 60, action: 'eating', label: 'Breakfast at her table', location: 'home_table', mood: 'peaceful' },
  { from: 7 * 60, to: 9 * 60, action: 'morning_garden', label: 'Morning garden care', location: 'garden', mood: 'focused' },
  { from: 9 * 60, to: 10 * 60 + 30, action: 'checking_herbs', label: 'Sorting herbs at her workbench', location: 'herb_workbench', mood: 'curious' },
  { from: 10 * 60 + 30, to: 12 * 60, action: 'village_errand', label: 'Walking to the village square', location: 'village_square', mood: 'content' },
  { from: 12 * 60, to: 13 * 60, action: 'eating', label: 'Lunch at home', location: 'home_table', mood: 'content' },
  { from: 13 * 60, to: 14 * 60, action: 'resting', label: 'Quiet rest inside her home', location: 'home', mood: 'peaceful' },
  { from: 14 * 60, to: 16 * 60, action: 'animal_care', label: 'Tending small animals', location: 'barn', mood: 'focused' },
  { from: 16 * 60, to: 17 * 60, action: 'watering_garden', label: 'Watering her field and garden', location: 'field', mood: 'focused' },
  { from: 17 * 60, to: 18 * 60 + 30, action: 'neighbor_walk', label: 'Walking near Arash road', location: 'arash_path', mood: 'curious' },
  { from: 18 * 60 + 30, to: 19 * 60 + 30, action: 'eating', label: 'Simple dinner at home', location: 'home_table', mood: 'content' },
  { from: 19 * 60 + 30, to: 21 * 60, action: 'evening_prayer', label: 'Evening prayer and quiet thoughts', location: 'prayer_house', mood: 'peaceful' },
  { from: 21 * 60, to: 22 * 60, action: 'checking_herbs', label: 'Writing herb notes at home', location: 'herb_workbench', mood: 'curious' },
  { from: 22 * 60, to: 24 * 60, action: 'sleeping', label: 'Sleeping in her home', location: 'home_bed', mood: 'tired' }
];

const PROVIDERS = [
  {
    name: 'OpenRouter',
    key: OPENROUTER_API_KEY,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: [PRIMARY_MODEL, FALLBACK_MODEL],
    headers: {
      'HTTP-Referer': 'https://village-ai-g0xj.onrender.com',
      'X-Title': 'Village AI'
    }
  },
  {
    name: 'SambaNova',
    key: SAMBANOVA_API_KEY,
    endpoint: 'https://api.sambanova.ai/v1/chat/completions',
    models: [SAMBANOVA_PRIMARY_MODEL, SAMBANOVA_FALLBACK_MODEL],
    headers: {}
  }
].filter(p => p.key && p.key !== 'MISSING_KEY');

function parseMinutes(time) {
  const [h = 0, m = 0] = String(time || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function updateAidaRoutine(worldTime) {
  const base = getAidaState();
  const minute = parseMinutes(worldTime);
  const step = ROUTINE.find(item => minute >= item.from && minute < item.to) || ROUTINE[0];
  const pos = AIDA_LOCATIONS[step.location] || AIDA_LOCATIONS.home;
  const sleeping = step.action === 'sleeping';
  const eating = step.action === 'eating';
  const next = {
    ...base,
    current_action: step.action,
    active_task_label: step.label,
    active_task_source: 'daily_routine',
    home_label: 'Aida homestead',
    mood: step.mood,
    position_x: pos.x,
    position_z: pos.z,
    energy: clamp((base.energy || 82) + (sleeping ? 0.6 : eating || step.action === 'resting' ? 0.08 : -0.18), 10, 100),
    hunger: clamp((base.hunger || 24) + (eating ? -0.9 : sleeping ? 0.06 : 0.14), 0, 100),
    relationship_arash: clamp(base.relationship_arash || 28, 0, 100)
  };
  saveAidaState(next);
  return next;
}

function buildAidaSocialDialogue(arashState = getState(), aidaState = getAidaState(), worldTime = arashState.world_time || '06:00') {
  const minute = parseMinutes(worldTime);
  const arashAction = arashState.active_task_label || arashState.current_action || 'کارهای مزرعه';
  const aidaAction = aidaState.active_task_label || aidaState.current_action || 'کارهای خانه';
  const closeWindow = minute >= 17 * 60 && minute < 18 * 60 + 30;
  const morningWindow = minute >= 7 * 60 && minute < 9 * 60;
  const nightWindow = minute >= 22 * 60 || minute < 6 * 60;

  if (nightWindow) {
    return [
      { speaker: 'arash', text: 'شب شده؛ باید انرژی‌ام را برای فردا نگه دارم.' },
      { speaker: 'aida', text: 'من هم در خانه‌ام آرام می‌خوابم؛ فردا باغچه کار دارد.' }
    ];
  }
  if (closeWindow) {
    return [
      { speaker: 'arash', text: 'آیدا را نزدیک مسیر دیدم؛ روستا کم‌کم زنده‌تر می‌شود.' },
      { speaker: 'aida', text: 'از کنار راه آرش می‌گذرم؛ شاید کم‌کم همسایه‌های خوبی شویم.' }
    ];
  }
  if (morningWindow) {
    return [
      { speaker: 'arash', text: `صبح را با ${arashAction} شروع کرده‌ام.` },
      { speaker: 'aida', text: 'من هم به باغچه‌ام سر می‌زنم؛ گیاه‌ها صبح را دوست دارند.' }
    ];
  }
  return [
    { speaker: 'arash', text: `فعلاً مشغول ${arashAction} هستم.` },
    { speaker: 'aida', text: `من هم ${aidaAction} را انجام می‌دهم.` }
  ];
}

function extractJSON(text) {
  const stripped = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in Aida response');
  return JSON.parse(match[0]);
}

async function callProvider(provider, model, messages) {
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
      ...provider.headers
    },
    body: JSON.stringify({ model, messages, temperature: 0.55, top_p: 0.86, max_tokens: 700 })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function fallbackReply(message, state, arashState, memories) {
  const text = String(message || '').toLowerCase();
  if (/سلام|درود|hello|hi/.test(text)) return 'سلام خالق. من آیدا هستم؛ در خانه جنوبی روستا زندگی می‌کنم و روزم بین باغچه، گیاهان و حیوانات می‌گذرد.';
  if (/تو کیستی|کی هستی|who are you/.test(text)) return 'من آیدا هستم؛ زنی از همین روستا که بیشتر با باغچه، گیاهان و مراقبت از جانوران سر و کار دارد.';
  if (/آرش|arash/.test(text)) return `آرش را می‌شناسم و حس می‌کنم همسایه مهمی برای این روستا می‌شود. فعلاً رابطه‌مان آرام و تازه است.`;
  if (/کجا هستی|where are you/.test(text)) return `الان نزدیک ${state.active_task_label || 'خانه‌ام'} هستم و روزم را آرام جلو می‌برم.`;
  const memory = memories?.[0]?.content;
  return memory ? `شنیدم. این را کنار چیزهایی که برایم مهم است نگه می‌دارم؛ مثل این خاطره: ${memory}` : 'شنیدم. با دقت به حرفت فکر می‌کنم و می‌گذارم روی تصمیم‌ها و زندگی‌ام اثر بگذارد.';
}

async function processAidaMessage(message) {
  const state = getAidaState();
  const arashState = getState();
  const recent = getAidaMemories(6);
  const relevant = searchAidaMemories(message, 6, { types: ['creator', 'social', 'life'] });
  const relation = state.relationship_arash || 28;

  const systemPrompt = `You are Aida, an ordinary human villager living in her own homestead near Arash.\n\nIdentity:\n- Name: Aida\n- Role: herbalist, gardener, and animal keeper\n- Home: Aida homestead, the southern homestead connected to the village square by a dirt road\n- Personality: observant, warm but not overly submissive, thoughtful, practical, quietly curious\n- Creator relationship: the Creator brought this world into being and may speak with you directly\n- Arash relationship: Arash is a nearby farmer. Your relationship is still new and should evolve slowly through shared memories and future interactions. Current closeness: ${relation}/100\n\nCurrent state:\n- Mood: ${state.mood || 'curious'}\n- Current activity: ${state.active_task_label || state.current_action || 'settling into village life'}\n- Aida home: ${state.home_label || 'Aida homestead'}\n- Arash current activity: ${arashState.current_action || 'idle'}\n\nRecent memories:\n${recent.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No recent memories.'}\n\nRelevant memories:\n${relevant.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No strongly relevant memory.'}\n\nAnswer in natural Persian. Do not mention percentages, JSON, model names, or internal systems unless directly asked.\nReturn raw JSON only with this shape:\n{\n  "aida_response": "one or two warm natural Persian sentences",\n  "memory": "short memory worth keeping",\n  "relationship_delta": 0\n}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Creator says: ${message}` }
  ];

  for (const provider of PROVIDERS) {
    for (const model of provider.models.filter(Boolean)) {
      try {
        const parsed = extractJSON(await callProvider(provider, model, messages));
        const response = String(parsed.aida_response || '').trim() || fallbackReply(message, state, arashState, relevant);
        const delta = clamp(Number(parsed.relationship_delta || 0), -3, 3);
        const next = { ...state, relationship_arash: clamp((state.relationship_arash || 28) + delta, 0, 100) };
        saveAidaState(next);
        if (parsed.memory) addAidaMemory(parsed.memory, { type: /آرش|arash/.test(parsed.memory) ? 'social' : 'creator', importance: 7 });
        return { aida_response: response, state: next };
      } catch (err) {
        console.error(`[Aida:${provider.name}] ${model} failed:`, String(err.message || err).slice(0, 180));
      }
    }
  }

  const fallback = fallbackReply(message, state, arashState, relevant);
  addAidaMemory(`Creator spoke with Aida: ${String(message || '').slice(0, 120)}`, { type: 'creator', importance: 6 });
  return { aida_response: fallback, state };
}

module.exports = { updateAidaRoutine, processAidaMessage, buildAidaSocialDialogue, AIDA_LOCATIONS };
