const {
  OPENROUTER_API_KEY,
  SAMBANOVA_API_KEY,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SAMBANOVA_PRIMARY_MODEL,
  SAMBANOVA_FALLBACK_MODEL
} = require('./config');
const { searchMemories } = require('./database');
const { readWorldState } = require('./world-state');
const { buildBrainSnapshot, buildBrainSystemPrompt } = require('./brain');

const LOCATIONS = {
  home:         { x: 0,    z: -5.5  },
  bed:          { x: -2.5, z: -9.5  },
  east_field:   { x: 10,   z: 0     },
  west_field:   { x: -10,  z: 0     },
  well:         { x: 6,    z: 2     },
  wood_stump:   { x: -3,   z: 3.5   },
  haystack:     { x: -5,   z: 5.5   },
  path_center:  { x: 0,    z: 3     },
  fishing_spot: { x: -10,  z: -10   },
  table:        { x: 2.2,  z: -9.0  },
  motorcycle:   { x: 4,    z: -4    },
  fence_north:  { x: 0,    z: 11    }
};

const VALID_ACTIONS = [
  'idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting',
  'eating', 'sleeping', 'running_to_shelter', 'sitting', 'fishing',
  'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'
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

if (PROVIDERS.length === 0) {
  console.warn('[AI] WARNING: No AI API key is set. Using local fallback decisions.');
} else {
  console.log(`[AI] Provider ready: ${PROVIDERS[0].name} (${PROVIDERS[0].key.slice(0, 10)}...)`);
}

let isAIBusy = false;

function extractJSON(text) {
  let stripped = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  stripped = stripped.replace(/```(?:json)?[\s\S]*?```/g, block =>
    block.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();

  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in AI response');
  return JSON.parse(match[0]);
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function chooseFallbackLocation(action, weather) {
  if (weather === 'rainy' || weather === 'stormy') return 'home';
  if (action === 'sleeping') return 'bed';
  if (action === 'eating') return 'table';
  if (action === 'watering_crops' || action === 'harvesting') return 'east_field';
  if (action === 'tending_crops') return 'west_field';
  if (action === 'chopping_wood') return 'wood_stump';
  if (action === 'fishing') return 'fishing_spot';
  if (action === 'checking_motorcycle') return 'motorcycle';
  return 'path_center';
}

function normalizeDecision(parsed, state, weather, timeStr) {
  const action = VALID_ACTIONS.includes(parsed.action) ? parsed.action : 'idle';
  const targetLocation = LOCATIONS[parsed.target_location] ? parsed.target_location : chooseFallbackLocation(action, weather);

  return {
    thought: parsed.thought || buildFallbackAction(state, weather, timeStr).thought,
    action,
    target_location: targetLocation,
    target_position: LOCATIONS[targetLocation] || { x: state.position_x || 0, z: state.position_z || 0 },
    duration: clampNumber(parsed.duration, 20, 5, 90),
    energy_delta: clampNumber(parsed.energy_delta, 0, -30, 30),
    hunger_delta: clampNumber(parsed.hunger_delta, 0, -40, 30),
    new_mood: parsed.new_mood || state.mood || 'content',
    memory: parsed.memory || `آرش در ساعت ${timeStr} تصمیم گرفت ${action} انجام دهد.`
  };
}

async function callProvider(provider, model, messages, temperature = 0.35) {
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
      top_p: 0.85,
      max_tokens: 750
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function askAI(state, memories, weather, overrideTime, upcomingSchedule) {
  if (isAIBusy) {
    console.warn('[AI] Previous AI call still running. Using local fallback for this tick.');
    return buildFallbackAction(state, weather, overrideTime);
  }

  isAIBusy = true;
  try {
    return await callAI(state, memories, weather, overrideTime, upcomingSchedule);
  } finally {
    isAIBusy = false;
  }
}

function buildDecisionMemoryQuery(state, weather, timeStr, upcomingSchedule) {
  const next = upcomingSchedule?.[0];
  return [
    state.current_action,
    state.mood,
    weather,
    timeStr,
    next?.label,
    next?.action,
    'farm crops food sleep creator'
  ].filter(Boolean).join(' ');
}

async function callAI(state, memories, weather, overrideTime, upcomingSchedule) {
  const timeStr = overrideTime || state.world_time || '08:00';
  const worldState = readWorldState();
  const relevantMemories = searchMemories(buildDecisionMemoryQuery(state, weather, timeStr, upcomingSchedule), 8, {
    types: ['creator', 'farm', 'survival', 'world', 'life']
  });
  const brain = buildBrainSnapshot({ ...state, weather, world_time: timeStr }, memories, worldState, relevantMemories);
  const schedText = upcomingSchedule && upcomingSchedule.length > 0
    ? upcomingSchedule.map(s => `- ${s.time}: ${s.label || s.action} (${s.action}, ${s.source || 'routine'})`).join('\n')
    : 'No scheduled task remains right now.';

  const systemPrompt = `${buildBrainSystemPrompt(brain, 'decision')}

Upcoming schedule:
${schedText}

Return only raw JSON. thought and memory must be Persian and natural. Do not write markdown.

Valid actions:
${VALID_ACTIONS.join(', ')}

Valid locations:
${Object.keys(LOCATIONS).join(', ')}

Exact JSON shape:
{
  "thought": "الان...",
  "action": "watering_crops",
  "target_location": "east_field",
  "duration": 30,
  "energy_delta": -5,
  "hunger_delta": 4,
  "new_mood": "focused",
  "memory": "آرش ..."
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Choose Arash next action as valid JSON only.' }
  ];

  for (const provider of PROVIDERS) {
    for (const model of provider.models.filter(Boolean)) {
      try {
        const text = await callProvider(provider, model, messages);
        const parsed = normalizeDecision(extractJSON(text), state, weather, timeStr);
        console.log(`[AI:${provider.name}:${model}] ${parsed.action} @ ${parsed.target_location} | ${parsed.thought}`);
        return parsed;
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[AI:${provider.name}] ${model} failed:`, msg.slice(0, 180));
      }
    }
  }

  console.warn('[AI] All providers failed. Using local fallback.');
  return buildFallbackAction(state, weather, timeStr);
}

function buildFallbackAction(state, weather, overrideTime) {
  const timeStr = overrideTime || state.world_time || '08:00';
  const [hh, mm = 0] = timeStr.split(':').map(Number);
  const hour = hh + mm / 60;

  if ((weather === 'rainy' || weather === 'stormy') && (state.position_z || 0) > -5) {
    return {
      action: 'running_to_shelter',
      target_location: 'home',
      target_position: LOCATIONS.home,
      duration: 15,
      energy_delta: -2,
      hunger_delta: 2,
      new_mood: 'worried',
      memory: 'آرش با دیدن بدتر شدن هوا به خانه پناه برد.',
      thought: 'هوا دارد بدتر می شود؛ بهتر است خودم را به خانه برسانم.'
    };
  }

  if ((state.energy || 80) < 20 || hour >= 22 || hour < 6) {
    return {
      action: 'sleeping',
      target_location: 'bed',
      target_position: LOCATIONS.bed,
      duration: 45,
      energy_delta: 15,
      hunger_delta: 4,
      new_mood: 'tired',
      memory: 'آرش برای بازیابی انرژی کمی خوابید.',
      thought: 'بدنم خسته است و وقت استراحت رسیده؛ باید بخوابم.'
    };
  }

  if ((state.hunger || 20) > 80) {
    return {
      action: 'eating',
      target_location: 'table',
      target_position: LOCATIONS.table,
      duration: 20,
      energy_delta: 4,
      hunger_delta: -25,
      new_mood: 'content',
      memory: 'آرش پشت میز نشست و غذای ساده ای خورد.',
      thought: 'گرسنگی تمرکزم را گرفته؛ بهتر است اول چیزی بخورم.'
    };
  }

  if (hour >= 8 && hour < 11) {
    return {
      action: 'watering_crops',
      target_location: 'east_field',
      target_position: LOCATIONS.east_field,
      duration: 30,
      energy_delta: -5,
      hunger_delta: 4,
      new_mood: 'focused',
      memory: 'آرش صبح را با رسیدگی به مزرعه شرقی گذراند.',
      thought: 'صبح برای مزرعه وقت خوبی است؛ قبل از گرم شدن روز باید به محصولات برسم.'
    };
  }

  return {
    action: 'wandering',
    target_location: 'path_center',
    target_position: LOCATIONS.path_center,
    duration: 20,
    energy_delta: -2,
    hunger_delta: 2,
    new_mood: 'peaceful',
    memory: 'آرش کمی در مسیر میان مزرعه قدم زد و اوضاع را زیر نظر گرفت.',
    thought: 'فعلا کار فوری ندارم؛ کمی قدم می زنم و به کارهای بعدی فکر می کنم.'
  };
}

module.exports = { askAI, LOCATIONS };
