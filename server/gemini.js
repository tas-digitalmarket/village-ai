const { SAMBANOVA_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL } = require('./config');

if (!SAMBANOVA_API_KEY || SAMBANOVA_API_KEY === 'MISSING_KEY') {
  console.warn('[AI] ⚠️ WARNING: SAMBANOVA_API_KEY is not set!');
} else {
  console.log('[AI] ✅ API Key loaded:', SAMBANOVA_API_KEY.slice(0, 10) + '...');
}

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

const MODELS = [PRIMARY_MODEL, FALLBACK_MODEL];

let isAIBusy = false;

function extractJSON(text) {
  // Strip DeepSeek <think> blocks
  let stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  stripped = stripped.replace(/```(?:json)?[\s\S]*?```/g, t =>
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
    return await _callAI(state, memories, weather, overrideTime, upcomingSchedule);
  } finally {
    isAIBusy = false;
  }
}

async function _callAI(state, memories, weather, overrideTime, upcomingSchedule) {
  const timeStr = overrideTime || state.world_time || '08:00';
  const [hh, mm] = timeStr.split(':').map(Number);
  const h = hh + (mm / 60);

  const memText = memories.slice(0, 6).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';
  const schedText = upcomingSchedule && upcomingSchedule.length > 0 
    ? upcomingSchedule.map(s => `- ${s.time}: ${s.label} (${s.action})`).join('\n')
    : 'No specific schedule right now.';

  const systemPrompt = `تو آرش هستی؛ یک ویلیجر خودمختار در یک دهکده مجازی. 
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
      const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'What is your next action based on the environment? Output ONLY JSON.' }
          ],
          temperature: 0.1,
          top_p: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content;
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
      const statusCode = msg.match(/HTTP (\d{3})/) ? parseInt(msg.match(/HTTP (\d{3})/)[1]) : 0;

      console.error(`[AI] ${modelName} HTTP ${statusCode}: `, msg.slice(0, 120));

      if (statusCode === 401 || statusCode === 403) {
        console.error(`[AI] ❌ API key invalid or API not enabled for ${modelName} — trying next model`);
        continue;
      }
      if (statusCode === 429) {
        console.warn(`[AI] ${modelName} rate limited — trying next model immediately`);
        continue;
      }
      continue;
    }
  }

  console.warn('[AI] All models exhausted — using smart fallback for this tick');
  return buildFallbackAction(state, weather, overrideTime);
}

function buildFallbackAction(state, weather, overrideTime) {
  const timeStr = overrideTime || state.world_time || '08:00';
  const [hh] = timeStr.split(':').map(Number);
  
  if (weather === 'rainy' && state.energy < 80) {
    return {
      action: 'running_to_shelter',
      target_location: 'home',
      target_position: LOCATIONS.home,
      duration: 15,
      energy_delta: 2,
      hunger_delta: -5,
      new_mood: 'grumpy',
      memory: 'آرش برای فرار از باران به پناهگاه رفت.',
      thought: 'بارون داره شدیدتر میشه، بهتره سریع برم زیر سقف.'
    };
  }

  if (state.energy < 20 || hh >= 22 || hh < 6) {
    return {
      action: 'sleeping',
      target_location: 'bed',
      target_position: LOCATIONS.bed,
      duration: 30,
      energy_delta: 15,
      hunger_delta: -5,
      new_mood: 'content',
      memory: 'آرش خوابید.',
      thought: 'خیلی خسته‌ام، وقت خوابه.'
    };
  }

  if (state.hunger > 80) {
    return {
      action: 'eating',
      target_location: 'table',
      target_position: LOCATIONS.table,
      duration: 15,
      energy_delta: 5,
      hunger_delta: -25,
      new_mood: 'content',
      memory: 'آرش غذا خورد.',
      thought: 'دیگه نمی‌تونم تمرکز کنم، باید یه چیزی بخورم.'
    };
  }

  return {
    action: 'idle',
    target_location: 'path_center',
    target_position: LOCATIONS.path_center,
    duration: 15,
    energy_delta: -1,
    hunger_delta: -2,
    new_mood: 'bored',
    memory: 'آرش استراحت کوتاهی کرد.',
    thought: 'فعلاً کار خاصی ندارم، یکم استراحت می‌کنم.'
  };
}

module.exports = { askGemini };
