const {
  OPENROUTER_API_KEY,
  SAMBANOVA_API_KEY,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SAMBANOVA_PRIMARY_MODEL,
  SAMBANOVA_FALLBACK_MODEL
} = require('./config');
const { searchMemories, getAidaState } = require('./database');
const { readWorldState } = require('./world-state');
const { buildBrainSnapshot, buildBrainSystemPrompt, buildConversationFallback } = require('./brain');

const VALID_ACTIONS = [
  'idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting',
  'eating', 'sleeping', 'running_to_shelter', 'sitting', 'fishing',
  'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'
];

const VALID_LOCATIONS = [
  'home', 'bed', 'table', 'east_field', 'west_field', 'well',
  'wood_stump', 'haystack', 'path_center', 'fishing_spot', 'motorcycle',
  'fence_north'
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isConversationOnly(message) {
  const text = String(message || '').toLowerCase();
  const commandHints = [
    'every day', 'daily', 'at ', 'right now',
    'هر روز', 'روزانه', 'ساعت', 'همین الان', 'فوری',
    'برو', 'انجام بده', 'آبیاری', 'بخواب', 'بخور', 'برداشت', 'چوب'
  ];
  return !commandHints.some(hint => text.includes(hint));
}

function extractJSON(text) {
  let stripped = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  stripped = stripped.replace(/```(?:json)?[\s\S]*?```/g, block =>
    block.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();

  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in AI response');
  return JSON.parse(match[0]);
}

function normalizeDirectiveResult(parsed, message, state, memories, worldState, relevantMemories) {
  const directives = Array.isArray(parsed.directives)
    ? parsed.directives
      .filter(d => d && VALID_ACTIONS.includes(d.action) && VALID_LOCATIONS.includes(d.location) && /^\d{2}:\d{2}$/.test(d.time || ''))
      .map(d => ({
        time: d.time,
        action: d.action,
        location: d.location,
        recurring: Boolean(d.recurring),
        label: String(d.label || d.action).slice(0, 80)
      }))
    : [];

  let immediate = null;
  if (parsed.immediate_action && VALID_ACTIONS.includes(parsed.immediate_action.action) && VALID_LOCATIONS.includes(parsed.immediate_action.location)) {
    immediate = {
      action: parsed.immediate_action.action,
      location: parsed.immediate_action.location,
      thought: parsed.immediate_action.thought || 'خالق از من خواسته همین حالا کاری انجام بدهم؛ انجامش می دهم.'
    };
  }

  let response = String(parsed.arash_response || '').trim();
  if (!response || !/[\u0600-\u06FF]/.test(response)) {
    response = buildConversationFallback(message, state, memories, worldState, relevantMemories);
  }

  return {
    arash_response: response,
    memory: parsed.memory || `Creator told Arash: ${message.slice(0, 100)}`,
    directives,
    immediate_action: immediate
  };
}

async function callProvider(provider, model, messages, temperature = 0.25) {
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
      ...provider.headers
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: 0.8,
      max_tokens: 850
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function memoryQueryForDecision(message, state) {
  return [
    message,
    state.current_action,
    state.mood,
    state.weather,
    state.world_time,
    'Aida ایدا neighbor همسایه'
  ].filter(Boolean).join(' ');
}

async function processDirective(message, state, memories) {
  const worldState = readWorldState();
  const aidaState = getAidaState();
  const arashState = { ...state, aida_state: aidaState };
  const relevantMemories = searchMemories(memoryQueryForDecision(message, arashState), 8, {
    types: ['creator', 'farm', 'survival', 'life', 'social']
  });
  const brain = buildBrainSnapshot(arashState, memories, worldState, relevantMemories);

  if (isConversationOnly(message)) {
    const systemPrompt = `${buildBrainSystemPrompt(brain, 'conversation')}

You are answering the Creator directly.
This is conversation, not a command parser. Arash should sound present, human, and aware of his world.
If the Creator asks about Aida, answer naturally: Aida is Arash's nearby neighbor, an herbalist/gardener/animal keeper, and their relationship is still new.
Return only valid JSON with this exact shape:
{
  "arash_response": "A natural Persian answer from Arash, one or two short sentences.",
  "memory": "A concise memory of what the Creator said.",
  "directives": [],
  "immediate_action": null
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Creator says: ${message}` }
    ];

    for (const provider of PROVIDERS) {
      for (const model of provider.models.filter(Boolean)) {
        try {
          const text = await callProvider(provider, model, messages, 0.5);
          return normalizeDirectiveResult(extractJSON(text), message, arashState, memories, worldState, relevantMemories);
        } catch (err) {
          console.error(`[Director:${provider.name}] conversation ${model} failed:`, String(err.message || err).slice(0, 180));
          if (String(err.message || '').includes('HTTP 429')) await sleep(1500);
        }
      }
    }

    return {
      arash_response: buildConversationFallback(message, arashState, memories, worldState, relevantMemories),
      memory: `Creator talked with Arash: ${message.slice(0, 100)}`,
      directives: [],
      immediate_action: null
    };
  }

  const systemPrompt = `${buildBrainSystemPrompt(brain, 'conversation')}

The Creator may be giving Arash a scheduled or immediate command.
Rules:
- If the message has a specific time, put it inside directives.
- If it says daily, every day, هر روز, روزانه, هر شب, or هر صبح, set recurring to true.
- If it says now, right now, الان, همین الان, فوری, or همین حالا as a command, create immediate_action.
- If it is only conversation, keep directives empty.
- arash_response must sound like Arash speaking naturally as a human farmer.
- Arash knows Aida is a nearby villager; use that knowledge naturally if the message mentions her.
- Do not mention percentages or internal state unless the Creator asked for them.
- Return only raw JSON; no markdown.

Valid actions:
${VALID_ACTIONS.join(', ')}

Valid locations:
${VALID_LOCATIONS.join(', ')}

JSON shape:
{
  "arash_response": "Persian answer from Arash.",
  "memory": "Creator asked Arash to...",
  "directives": [
    {"time":"09:00","action":"watering_crops","location":"east_field","recurring":true,"label":"Water the east field"}
  ],
  "immediate_action": null
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Creator says: ${message}` }
  ];

  for (const provider of PROVIDERS) {
    for (const model of provider.models.filter(Boolean)) {
      try {
        const text = await callProvider(provider, model, messages);
        const parsed = normalizeDirectiveResult(extractJSON(text), message, arashState, memories, worldState, relevantMemories);
        console.log(`[Director:${provider.name}:${model}] creator message parsed`);
        return parsed;
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[Director:${provider.name}] ${model} failed:`, msg.slice(0, 180));
        if (msg.includes('HTTP 429')) await sleep(1500);
      }
    }
  }

  return {
    arash_response: buildConversationFallback(message, arashState, memories, worldState, relevantMemories),
    memory: `Creator talked with Arash: ${message.slice(0, 100)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
