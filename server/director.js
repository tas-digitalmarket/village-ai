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

function isConversationOnly(message) {
  const text = String(message || '').toLowerCase();
  const commandHints = [
    'every day', 'daily', 'at ', 'now', 'right now',
    'هر روز', 'روزانه', 'ساعت', 'الان', 'همین الان', 'فوری',
    'برو', 'انجام بده', 'آبیاری', 'بخواب', 'بخور', 'برداشت', 'چوب'
  ];
  return !commandHints.some(hint => text.includes(hint));
}

function buildLocalConversation(message, state = {}) {
  const clean = String(message || '').trim();
  const short = clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
  const response = clean
    ? 'من آرشم؛ کشاورز همین مزرعه. حرفت را می‌شنوم و سعی می‌کنم از جای خودم، ساده و طبیعی جواب بدهم.'
    : 'من اینجا هستم، خالقم. حرفت را بگو تا از نگاه خودم جواب بدهم.';

  return {
    arash_response: response,
    memory: `Creator talked with Arash: ${short}`,
    directives: [],
    immediate_action: null
  };
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

  let response = parsed.arash_response || buildLocalConversation(message).arash_response;
  if (!/[\u0600-\u06FF]/.test(response) || /شنیدم.*به خاطر می‌سپارم/.test(response)) {
    response = buildLocalConversation(message).arash_response;
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
      temperature: 0.65,
      top_p: 0.9,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function cleanConversationText(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()
    .slice(0, 700);
}

async function processConversation(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'خاطره تازه‌ای نیست.';
  const systemPrompt = `تو آرش هستی؛ از نگاه خودت یک انسان عادی، یک کشاورز روستایی که در همین مزرعه زندگی می‌کند.
Creator همان کسی است که با تو حرف می‌زند و می‌تواند مسیر زندگی و کارهایت را جهت بدهد.
پاسخ تو باید طبیعی، کوتاه، فارسی، اول‌شخص، و مخصوص همین پیام باشد؛ مثل یک آدم معمولی جواب بده، نه مثل گزارش سیستم.
جمله‌های قالبی مثل «شنیدم و به خاطر می‌سپارم» را تکرار نکن.
درصد انرژی، گرسنگی، زمان، mood یا نام action را در جواب نیاور مگر خود Creator دقیقاً درباره وضعیت، انرژی، گرسنگی، زمان یا کارت پرسیده باشد.
اگر سؤال شخصی، احوال‌پرسی، هویتی، یا سؤال درباره زندگی/مزرعه است، از هویت و تجربه خودت به عنوان آرشِ کشاورز جواب بده.
اگر پیام مبهم است، از نگاه آرش یک پاسخ انسانی و کوتاه بده.

وضعیت فعلی:
- زمان: ${state.world_time || '06:00'}
- حال‌وهوا: ${state.mood || 'content'}
- کار فعلی: ${state.current_action || 'idle'}
- انرژی: ${state.energy ?? 'نامشخص'}
- گرسنگی: ${state.hunger ?? 'نامشخص'}

خاطرات اخیر:
${memText}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ];

  for (const provider of PROVIDERS) {
    for (const model of provider.models.filter(Boolean)) {
      try {
        const text = cleanConversationText(await callProvider(provider, model, messages));
        if (text && /[آ-ی]/.test(text) && !/Yes,\s*my Creator/i.test(text) && !/شنیدم.*به خاطر می‌سپارم/.test(text)) {
          return {
            arash_response: text,
            memory: `Creator talked with Arash: ${message.slice(0, 80)}`,
            directives: [],
            immediate_action: null
          };
        }
      } catch (err) {
        console.error(`[Director:${provider.name}] conversation ${model} failed:`, String(err.message || err).slice(0, 180));
        if (String(err.message || err).includes('HTTP 429')) await sleep(1500);
      }
    }
  }

  return buildLocalConversation(message, state);
}

async function processDirective(message, state, memories) {
  if (isConversationOnly(message)) {
    return processConversation(message, state, memories);
  }

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

  return buildLocalConversation(message, state);
}

module.exports = { processDirective };
