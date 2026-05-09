const {
  OPENROUTER_API_KEY,
  SAMBANOVA_API_KEY,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SAMBANOVA_PRIMARY_MODEL,
  SAMBANOVA_FALLBACK_MODEL
} = require('./config');

const VALID_ACTIONS = [
  'idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting',
  'eating', 'sleeping', 'sitting', 'fishing', 'tending_animals',
  'checking_motorcycle', 'wandering', 'tending_crops'
];

const VALID_LOCATIONS = [
  'home', 'bed', 'table', 'east_field', 'west_field', 'well',
  'wood_stump', 'haystack', 'path_center', 'fishing_spot', 'motorcycle'
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

function extractJSON(text) {
  let stripped = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  stripped = stripped.replace(/```(?:json)?[\s\S]*?```/g, block =>
    block.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();

  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in AI response');
  return JSON.parse(match[0]);
}

function normalizeDirectiveResult(parsed, message) {
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
      thought: parsed.immediate_action.thought || 'خالق از من خواسته همین حالا کاری انجام بدهم؛ پس انجامش می‌دهم.'
    };
  }

  let response = parsed.arash_response || 'Yes, my Creator. I heard you.\nبله خالقم، شنیدم و به یاد می‌سپارم.';
  if (!/[\u0600-\u06FF]/.test(response)) {
    response += '\nبله خالقم، شنیدم و به یاد می‌سپارم.';
  }
  if (!/[A-Za-z]/.test(response)) {
    response = `Yes, my Creator. I heard you.\n${response}`;
  }

  return {
    arash_response: response,
    memory: parsed.memory || `Creator command: ${message.slice(0, 80)}`,
    directives,
    immediate_action: immediate
  };
}

async function callProvider(provider, model, messages) {
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
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'هنوز خاطره مهمی ثبت نشده است.';

  const systemPrompt = `تو آرش هستی؛ یک روستایی خودمختار، آرام و وظیفه‌شناس.
Creator مستقیم با تو حرف زده است. باید پیام او را بفهمی، محترمانه جواب بدهی، و اگر دستور زمان‌دار یا فوری دارد آن را به ساختار قابل اجرا تبدیل کنی.

پیام Creator:
"${message}"

وضعیت فعلی:
- زمان: ${state.world_time || '06:00'}
- کار فعلی: ${state.current_action || 'idle'}
- حال‌وهوا: ${state.mood || 'content'}

خاطرات اخیر:
${memText}

قواعد:
- اگر پیام زمان مشخص دارد، آن را داخل directives بگذار.
- اگر پیام شامل daily، every day، هر روز، روزانه، هر شب یا هر صبح بود recurring را true کن.
- اگر پیام شامل now، right now، الان، همین الان، فوری یا همین حالا بود immediate_action بساز.
- اگر پیام فقط گفتگو بود و دستور اجرایی نداشت، directives خالی باشد.
- پاسخ arash_response باید دو خط داشته باشد: خط اول انگلیسی، خط دوم فارسی.
- فقط JSON خام بده؛ markdown یا توضیح اضافه ننویس.

اکشن‌های معتبر:
${VALID_ACTIONS.join(', ')}

لوکیشن‌های معتبر:
${VALID_LOCATIONS.join(', ')}

فرمت:
{
  "arash_response": "Yes, my Creator. I will water the east field every morning at 09:00.\\nبله خالقم، هر صبح ساعت ۰۹:۰۰ مزرعه شرقی را آبیاری می‌کنم.",
  "memory": "Creator asked Arash to water the east field every morning.",
  "directives": [
    {"time":"09:00","action":"watering_crops","location":"east_field","recurring":true,"label":"Water the east field"}
  ],
  "immediate_action": null
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'پیام Creator را تحلیل کن و فقط JSON معتبر بده.' }
  ];

  for (const provider of PROVIDERS) {
    for (const model of provider.models.filter(Boolean)) {
      try {
        const text = await callProvider(provider, model, messages);
        const parsed = normalizeDirectiveResult(extractJSON(text), message);
        console.log(`[Director:${provider.name}:${model}] directive parse ok`);
        return parsed;
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[Director:${provider.name}] ${model} failed:`, msg.slice(0, 180));
        if (msg.includes('HTTP 429')) await sleep(1500);
      }
    }
  }

  return {
    arash_response: 'Yes, my Creator. I heard you and will remember your words.\nبله خالقم، حرفت را شنیدم و به یاد می‌سپارم.',
    memory: `Creator command: ${message.slice(0, 80)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
