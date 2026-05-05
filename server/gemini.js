const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL } = require('./config');

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'MISSING_KEY') {
  console.warn('[Gemini] ⚠️ WARNING: GEMINI_API_KEY is not set!');
} else {
  console.log('[Gemini] ✅ API Key loaded:', GEMINI_API_KEY.slice(0, 10) + '...');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const LOCATIONS = {
  home:         { x: 0,   z: 0    },
  bed:          { x: 0,   z: 0.2  },
  east_field:   { x: 10,  z: 0    },
  west_field:   { x: -10, z: 0    },
  well:         { x: 0,   z: 10   },
  wood_stump:   { x: 5,   z: 5    },
  haystack:     { x: -5,  z: 5    },
  path_center:  { x: 0,   z: 0    },
  prayer_spot:  { x: 2,   z: -4   },
  fishing_spot: { x: -10, z: -10  },
  table:        { x: 0.5, z: -0.5 },
  motorcycle:   { x: 8,   z: -8   },
  fence_north:  { x: 0,   z: 20   }
};

// Try multiple model names — Gemini 2.0 Flash first, then 1.5
const MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b'
];

function extractJSON(text) {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?[\s\S]*?```/g, t =>
    t.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

async function askGemini(state, memories, weather) {
  const h = parseFloat((state.world_time || '08:00').replace(':', '.'));
  const memText = memories.slice(0, 6).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';
  const routineHint = getRoutineHint(h, weather, state);

  const prompt = `You are the autonomous AI brain of Arash, a 35-year-old village farmer.
Output ONLY a raw JSON object. No markdown, no explanation.

STATE: Time ${state.world_time} | Energy ${state.energy}/100 | Hunger ${state.hunger}/100 | Weather: ${weather} | Mood: ${state.mood}
ROUTINE: ${routineHint}
MEMORIES: ${memText}

LOCATIONS: home(0,0), bed(0,0.2), east_field(10,0), west_field(-10,0), well(0,10), wood_stump(5,5), haystack(-5,5), path_center(0,0), prayer_spot(2,-4), fishing_spot(-10,-10), table(0.5,-0.5), motorcycle(8,-8)
VALID ACTIONS: idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, running_to_shelter, sitting, praying, fishing, tending_animals, checking_motorcycle, wandering

JSON format (copy this structure exactly):
{"action":"eating","target_location":"table","target_position":{"x":0.5,"z":-0.5},"duration":15,"energy_delta":3,"hunger_delta":-15,"new_mood":"content","memory":"Arash ate breakfast.","thought":"Food gives me strength for the day."}`;

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
      // Log FULL error for debugging
      const msg = err.message || String(err);
      console.error(`[AI] ${modelName} FULL ERROR:`, msg.slice(0, 200));

      const is429 = msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate');
      const is404 = msg.includes('404') || msg.toLowerCase().includes('not found');
      const is403 = msg.includes('403') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('api key');

      if (is403) { console.error(`[AI] ❌ API KEY INVALID or API not enabled for project!`); break; }
      if (is429) { console.warn(`[AI] ${modelName} rate limited — waiting 3s then trying next...`); await sleep(3000); continue; }
      if (is404) { console.warn(`[AI] ${modelName} not found — trying next...`); continue; }
      continue;
    }
  }

  console.warn('[AI] All models exhausted — using smart fallback');
  return buildFallbackAction(state, weather);
}

function getRoutineHint(h, weather, state) {
  if (weather === 'rainy' || weather === 'stormy') return 'WEATHER: Go inside immediately (running_to_shelter to home).';
  if (state.energy < 15) return 'CRITICAL: Energy too low — sleep at bed NOW.';
  if (state.hunger > 85) return 'CRITICAL: Very hungry — eat at table NOW.';
  if (h >= 22 || h < 4.5)  return 'Sleep at bed.';
  if (h >= 4.5 && h < 6)   return 'Wake up — morning prayer at prayer_spot (Fajr).';
  if (h >= 6 && h < 6.5)   return 'Morning tea and breakfast at table.';
  if (h >= 6.5 && h < 9)   return 'Water the east and west fields (watering_crops).';
  if (h >= 9 && h < 12)    return 'Chop wood at wood_stump.';
  if (h >= 12 && h < 12.5) return 'Noon prayer at prayer_spot (Dhuhr).';
  if (h >= 12.5 && h < 14) return 'Lunch at table.';
  if (h >= 14 && h < 15.5) return 'Rest at home (nap or sit).';
  if (h >= 15.5 && h < 16) return 'Afternoon prayer at prayer_spot (Asr).';
  if (h >= 16 && h < 18.5) return 'Harvest or tend crops in the fields.';
  if (h >= 18.5 && h < 19) return 'Sunset prayer at prayer_spot (Maghrib).';
  if (h >= 19 && h < 20)   return 'Dinner at table.';
  if (h >= 20 && h < 21)   return 'Sit outside at path_center and watch the stars.';
  if (h >= 21 && h < 21.5) return 'Night prayer at prayer_spot (Isha).';
  return 'Wind down and prepare for sleep.';
}

function buildFallbackAction(state, weather) {
  const h = parseFloat((state.world_time || '08:00').replace(':', '.'));
  let action = 'idle', loc = 'path_center';

  if (weather === 'rainy' || weather === 'stormy') { action = 'running_to_shelter'; loc = 'home'; }
  else if (state.energy < 15) { action = 'sleeping'; loc = 'bed'; }
  else if (state.hunger > 85) { action = 'eating';   loc = 'table'; }
  else if (h >= 22 || h < 4.5) { action = 'sleeping';      loc = 'bed'; }
  else if (h < 6)               { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 6.5)             { action = 'eating';         loc = 'table'; }
  else if (h < 9)               { action = 'watering_crops'; loc = 'east_field'; }
  else if (h < 12)              { action = 'chopping_wood';  loc = 'wood_stump'; }
  else if (h < 12.5)            { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 14)              { action = 'eating';         loc = 'table'; }
  else if (h < 15.5)            { action = 'sitting';        loc = 'home'; }
  else if (h < 16)              { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 18.5)            { action = 'harvesting';     loc = 'east_field'; }
  else if (h < 19)              { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 20)              { action = 'eating';         loc = 'table'; }
  else if (h < 21)              { action = 'sitting';        loc = 'path_center'; }
  else if (h < 21.5)            { action = 'praying';        loc = 'prayer_spot'; }
  else                          { action = 'sleeping';        loc = 'bed'; }

  const pos = LOCATIONS[loc] || { x: 0, z: 0 };
  const thoughts = {
    sleeping: 'Goodnight. Tomorrow brings more work.',
    praying: 'Alhamdulillah. I am grateful.',
    eating: 'Food is a blessing from God.',
    watering_crops: 'The soil is thirsty.',
    chopping_wood: 'Hard work builds strength.',
    harvesting: 'A good harvest, thank God.',
    sitting: 'A moment of peace.',
    running_to_shelter: 'The rain is coming — get inside!'
  };

  return {
    action, target_location: loc, target_position: pos,
    duration: 15,
    energy_delta: action === 'sleeping' ? 10 : action === 'eating' ? 3 : -3,
    hunger_delta: action === 'eating' ? -15 : 3,
    new_mood: 'content',
    memory: `Arash ${action.replace(/_/g, ' ')} at ${loc}.`,
    thought: thoughts[action] || 'Continuing the day...'
  };
}

module.exports = { askGemini, LOCATIONS };
