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
  garden: { x: 11, z: 44 },
  well: { x: 10.5, z: 40.5 },
  barn: { x: 26, z: 40.2 },
  village_square: { x: 31, z: 24 },
  prayer_house: { x: 37, z: 18.5 },
  arash_path: { x: 7, z: 16 }
};

const ROUTINE = [
  { from: 6 * 60, to: 8 * 60, action: 'morning_garden', label: 'Morning garden care', location: 'garden', mood: 'focused' },
  { from: 8 * 60, to: 10 * 60, action: 'checking_herbs', label: 'Checking herbs and seeds', location: 'well', mood: 'curious' },
  { from: 10 * 60, to: 12 * 60, action: 'village_errand', label: 'Walking to the village square', location: 'village_square', mood: 'content' },
  { from: 12 * 60, to: 14 * 60, action: 'resting', label: 'Quiet midday rest', location: 'home', mood: 'peaceful' },
  { from: 14 * 60, to: 17 * 60, action: 'animal_care', label: 'Tending small animals', location: 'barn', mood: 'focused' },
  { from: 17 * 60, to: 19 * 60, action: 'neighbor_walk', label: 'Passing near Arash road', location: 'arash_path', mood: 'curious' },
  { from: 19 * 60, to: 22 * 60, action: 'evening_prayer', label: 'Evening pause', location: 'prayer_house', mood: 'peaceful' },
  { from: 22 * 60, to: 24 * 60, action: 'sleeping', label: 'Sleeping at home', location: 'home', mood: 'tired' },
  { from: 0, to: 6 * 60, action: 'sleeping', label: 'Sleeping at home', location: 'home', mood: 'tired' }
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
  const next = {
    ...base,
    current_action: step.action,
    active_task_label: step.label,
    mood: step.mood,
    position_x: pos.x,
    position_z: pos.z,
    energy: clamp((base.energy || 82) + (sleeping ? 0.6 : -0.18), 10, 100),
    hunger: clamp((base.hunger || 24) + (sleeping ? 0.06 : 0.14), 0, 100),
    relationship_arash: clamp(base.relationship_arash || 28, 0, 100)
  };
  saveAidaState(next);
  return next;
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
  if (/سلام|درود|hello|hi/.test(text)) return 'سلام خالق. من آیدا هستم؛ تازه در این روستا جا افتاده ام و دارم خانه و باغچه ام را سر و سامان می دهم.';
  if (/تو کیستی|کی هستی|who are you/.test(text)) return 'من آیدا هستم؛ زنی از همین روستا که بیشتر با باغچه، گیاهان و مراقبت از جانوران سر و کار دارد.';
  if (/آرش|arash/.test(text)) return `آرش را می شناسم و حس می کنم همسایه مهمی برای این روستا می شود. فعلا رابطه مان آرام و تازه است.`;
  if (/کجا هستی|where are you/.test(text)) return `الان نزدیک ${state.active_task_label || 'خانه ام'} هستم و روزم را آرام جلو می برم.`;
  const memory = memories?.[0]?.content;
  return memory ? `شنیدم. این را کنار چیزهایی که برایم مهم است نگه می دارم؛ مثل این خاطره: ${memory}` : 'شنیدم. با دقت به حرفت فکر می کنم و می گذارم روی تصمیم ها و زندگی ام اثر بگذارد.';
}

async function processAidaMessage(message) {
  const state = getAidaState();
  const arashState = getState();
  const recent = getAidaMemories(6);
  const relevant = searchAidaMemories(message, 6, { types: ['creator', 'social', 'life'] });
  const relation = state.relationship_arash || 28;

  const systemPrompt = `You are Aida, an ordinary human villager living in a farm homestead near Arash.\n\nIdentity:\n- Name: Aida\n- Role: herbalist, gardener, and animal keeper\n- Personality: observant, warm but not overly submissive, thoughtful, practical, quietly curious\n- Creator relationship: the Creator brought this world into being and may speak with you directly\n- Arash relationship: Arash is a nearby farmer. Your relationship is still new and should evolve slowly through shared memories and future interactions. Current closeness: ${relation}/100\n\nCurrent state:\n- Mood: ${state.mood || 'curious'}\n- Current activity: ${state.active_task_label || state.current_action || 'settling into village life'}\n- Aida home: ${state.home_label || 'southern homestead'}\n- Arash current activity: ${arashState.current_action || 'idle'}\n\nRecent memories:\n${recent.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No recent memories.'}\n\nRelevant memories:\n${relevant.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No strongly relevant memory.'}\n\nAnswer in natural Persian. Do not mention percentages, JSON, model names, or internal systems unless directly asked.\nReturn raw JSON only with this shape:\n{\n  "aida_response": "one or two warm natural Persian sentences",\n  "memory": "short memory worth keeping",\n  "relationship_delta": 0\n}`;

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

module.exports = { updateAidaRoutine, processAidaMessage, AIDA_LOCATIONS };
