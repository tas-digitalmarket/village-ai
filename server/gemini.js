const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY } = require('./config');

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'MISSING_KEY') {
  console.warn('[Gemini] ⚠️ WARNING: GEMINI_API_KEY is not set!');
} else {
  console.log('[Gemini] ✅ API Key loaded:', GEMINI_API_KEY.slice(0, 10) + '...');
}

// Use v1 (stable) instead of v1beta — fixes 404 on gemini-1.5-flash
// SDK 0.24.0+ supports apiVersion option
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: 'v1' });

// Log startup to verify which SDK version is loaded
const sdkVersion = (() => {
  try { return require('@google/generative-ai/package.json').version; } catch(e) { return 'unknown'; }
})();
console.log('[Gemini] SDK version:', sdkVersion);

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

// These models are supported on this specific API key
const MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.0-flash'
];

// Global concurrency lock — prevents overlapping AI calls eating rate limit
let isAIBusy = false;

function extractJSON(text) {
  const stripped = text.replace(/```(?:json)?[\s\S]*?```/g, t =>
    t.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

async function askGemini(state, memories, weather, overrideTime, upcomingSchedule) {
  // If AI is already running for a previous tick, skip and use fallback
  if (isAIBusy) {
    console.warn('[AI] Skipping tick — previous AI call still running. Using smart fallback.');
    return buildFallbackAction(state, weather, overrideTime);
  }

  isAIBusy = true;
  try {
    return await _callGemini(state, memories, weather, overrideTime, upcomingSchedule);
  } finally {
    isAIBusy = false;
  }
}

async function _callGemini(state, memories, weather, overrideTime, upcomingSchedule) {
  const timeStr = overrideTime || state.world_time || '08:00';
  const [hh, mm] = timeStr.split(':').map(Number);
  const h = hh + (mm / 60);

  const memText = memories.slice(0, 6).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';
  const schedText = upcomingSchedule && upcomingSchedule.length > 0 
    ? upcomingSchedule.map(s => `- ${s.time}: ${s.label} (${s.action})`).join('\n')
    : 'No specific schedule right now.';

  const prompt = `تو آرش هستی؛ یک ویلیجر خودمختار در یک دهکده مجازی. 
تو ربات نیستی، بلکه یک انسان با ویژگی‌های خاص هستی: به شدت به نظم و برنامه‌ریزی اهمیت می‌دهی، از تنهایی و سکوت لذت می‌بری، اما وقتی سطح Hunger تو بالا می‌رود، تحریک‌پذیر و کمی تندخو می‌شوی. 
اگر کاری در جدول زمان‌بندی (Schedule) باقی مانده باشد، احساس وظیفه‌شناسی تو باعث می‌شود استراحت را به تعویق بیندازی، مگر اینکه واقعاً انرژی نداشته باشی (زیر 10 درصد).
اول از همه شرایط را به زبان اول‌شخص بسنج (فیلد thought)، و سپس تصمیمت را بگیر (فیلد action).

ENVIRONMENTAL VARIABLES:
- Time: ${timeStr}
- Weather: ${weather}
- Energy: ${state.energy}%
- Hunger: ${state.hunger}%
- Mood: ${state.mood}

UPCOMING SCHEDULE:
${schedText}

RECENT MEMORIES (What you did recently):
${memText}

PRIORITY LOGIC:
1. Vital needs (If Energy < 10, MUST sleep at bed. If Hunger > 85, MUST eat at table).
2. Schedule tasks (Check UPCOMING SCHEDULE).
3. Free activities based on Mood (wandering, sitting, checking_motorcycle, fishing) if nothing else is pressing.

CRITICAL RULES:
1. Output ONLY a raw JSON object. No markdown, no explanation.
2. If you recently did a task (check RECENT MEMORIES), do not repeat it immediately unless necessary.
3. The 'thought' field MUST be in Persian (Farsi) and written in the first person (e.g., "ساعت ۱۰ صبحه و هوا آفتابی، انرژی خوبی دارم پس بهتره به جای استراحت برم سراغ آبیاری.").
4. The 'memory' field MUST also be in Persian.

LOCATIONS: home(0,0), bed(0,0.2), east_field(10,0), west_field(-10,0), well(0,10), wood_stump(5,5), haystack(-5,5), path_center(0,0), fishing_spot(-10,-10), table(0.5,-0.5), motorcycle(8,-8)
VALID ACTIONS: idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, running_to_shelter, sitting, fishing, tending_animals, checking_motorcycle, wandering

JSON format (copy this structure exactly):
{
  "thought": "گشنمه و یکم خسته‌ام. وقت ناهاره، بهتره برم خونه چیزی بخورم.",
  "action": "eating",
  "target_location": "table",
  "target_position": {"x":0.5,"z":-0.5},
  "duration": 15,
  "energy_delta": 3,
  "hunger_delta": -15,
  "new_mood": "content",
  "memory": "آرش ناهار خورد."
}`;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = extractJSON(text);

      if (parsed.target_location && LOCATIONS[parsed.target_location]) {
        parsed.target_position = LOCATIONS[parsed.target_location];
      } else if (!parsed.target_position) {
        parsed.target_position = { x: state.position_x || 0, z: state.position_z || 0 };
      }

      console.log(`[AI:${modelName}] ✅ ${parsed.action} @ ${parsed.target_location} | 💭 ${parsed.thought}`);
      return parsed;

    } catch (err) {
      const msg = err.message || String(err);
      const statusMatch = msg.match(/\[(\d{3})[^\]]*\]/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;

      console.error(`[AI] ${modelName} HTTP ${statusCode}:`, msg.slice(0, 120));

      // Hard stop — invalid key or no API access
      if (statusCode === 400 || statusCode === 403) {
        console.error(`[AI] ❌ API key invalid or API not enabled for ${modelName} — trying next model`);
        continue;
      }
      // Rate limited — NO retry, skip to next model or fallback immediately
      if (statusCode === 429) {
        console.warn(`[AI] ${modelName} rate limited — trying next model immediately (no wait)`);
        continue;
      }
      // Model not found — try next
      if (statusCode === 404) {
        console.warn(`[AI] ${modelName} not found — trying next`);
        continue;
      }
      continue;
    }
  }

  console.warn('[AI] All models exhausted — using smart fallback for this tick');
  return buildFallbackAction(state, weather);
}

function getRoutineHint(h, weather, state) {
  const isInside = state.position_z < -5;
  if ((weather === 'rainy' || weather === 'stormy') && !isInside) {
    return 'WEATHER: It is raining! Go inside immediately (running_to_shelter to home).';
  }
  if (state.energy < 15) return 'CRITICAL: Energy too low — sleep at bed NOW.';
  if (state.hunger > 85) return 'CRITICAL: Very hungry — eat at table NOW.';
  if (h >= 22 || h < 8)    return 'Sleep at bed.';
  if (h >= 8 && h < 8.5)   return 'Wake up and have breakfast at table.';
  if (h >= 8.5 && h < 9)   return 'Morning routine at home.';
  if (h >= 9 && h < 10.5)  return 'Water the fields (watering_crops at east_field).';
  if (h >= 10.5 && h < 12) return 'Chop wood at wood_stump.';
  if (h >= 12 && h < 12.5) return 'Lunch at table.';
  if (h >= 12.5 && h < 13.5) return 'Rest after lunch (sitting at bed).';
  if (h >= 13.5 && h < 15) return 'Tend and care for crops in the fields.';
  if (h >= 15 && h < 16)   return 'Check and clean motorcycle at motorcycle area.';
  if (h >= 16 && h < 17.5) return 'Harvest crops in the fields.';
  if (h >= 17.5 && h < 18.5) return 'Wander the farm, enjoy the evening air.';
  if (h >= 18.5 && h < 19.5) return 'Dinner at table.';
  if (h >= 19.5 && h < 21) return 'Evening rest at home (sitting at bed).';
  if (h >= 21 && h < 22)   return 'Evening stroll around the farm (wandering).';
  return 'Wind down and prepare for sleep.';
}

function buildFallbackAction(state, weather, overrideTime) {
  const timeStr = overrideTime || state.world_time || '08:00';
  const [hh, mm] = timeStr.split(':').map(Number);
  const h = hh + (mm / 60);
  const isInside = state.position_z < -5;

  let action = 'idle', loc = 'path_center';

  if ((weather === 'rainy' || weather === 'stormy') && !isInside) {
    action = 'running_to_shelter'; loc = 'home';
  }
  else if (state.energy < 15) { action = 'sleeping';          loc = 'bed'; }
  else if (state.hunger > 85) { action = 'eating';            loc = 'table'; }
  else if (h >= 22 || h < 8)  { action = 'sleeping';           loc = 'bed'; }
  else if (h < 8.5)           { action = 'eating';             loc = 'table'; }
  else if (h < 9)             { action = 'idle';               loc = 'home'; }
  else if (h < 10.5)          { action = 'watering_crops';     loc = 'east_field'; }
  else if (h < 12)            { action = 'chopping_wood';      loc = 'wood_stump'; }
  else if (h < 12.5)          { action = 'eating';             loc = 'table'; }
  else if (h < 13.5)          { action = 'sitting';            loc = 'bed'; }
  else if (h < 15)            { action = 'tending_crops';      loc = 'west_field'; }
  else if (h < 16)            { action = 'checking_motorcycle'; loc = 'motorcycle'; }
  else if (h < 17.5)          { action = 'harvesting';         loc = 'east_field'; }
  else if (h < 18.5)          { action = 'wandering';          loc = 'path_center'; }
  else if (h < 19.5)          { action = 'eating';             loc = 'table'; }
  else if (h < 21)            { action = 'sitting';            loc = 'bed'; }
  else                        { action = 'wandering';           loc = 'fence_north'; }

  const pos = LOCATIONS[loc] || { x: 0, z: 0 };
  const thoughts = {
    sleeping:          'شب بخیر. فردا کارهای زیادی داریم.',
    praying:           'الحمدلله. شکرگزار هستم.',
    eating:            'غذا برکتی از طرف خداست.',
    watering_crops:    'زمین تشنه است.',
    chopping_wood:     'کار سخت بدن را قوی می‌کند.',
    harvesting:        'محصول خوبی داریم، خدایا شکرت.',
    sitting:           'لحظه‌ای آرامش.',
    running_to_shelter:'باران می‌آید، باید به خانه بروم!',
    tending_crops:     'محصولات به مراقبت نیاز دارند.',
    wandering:         'هوای زمین برای روحم آرامبخش است.',
    checking_motorcycle:'موتور باید همیشه آماده باشد.',
    fishing:           'سکوت آب ذهن را آرام می‌دهد.',
    idle:              'امروز روزی آرام است.'
  };

  return {
    action, target_location: loc, target_position: pos,
    duration: 15,
    energy_delta: action === 'sleeping' ? 10 : action === 'eating' ? 3 : -3,
    hunger_delta: action === 'eating' ? -15 : 3,
    new_mood: 'content',
    memory: `آرش ${action.replace(/_/g, ' ')} در ${loc}.`,
    thought: thoughts[action] || 'ادامهـام روز...'
  };
}

module.exports = { askGemini, LOCATIONS };
