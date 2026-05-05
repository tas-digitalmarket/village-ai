const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL } = require('./config');

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'MISSING_KEY') {
  console.warn('[Gemini] ⚠️ WARNING: GEMINI_API_KEY is not set!');
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

const MODELS = [PRIMARY_MODEL, FALLBACK_MODEL];

async function askGemini(state, memories, weather) {
  const h = parseFloat((state.world_time || '08:00').replace(':', '.'));
  const memText = memories.slice(0, 6).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';
  const routineHint = getRoutineHint(h, weather, state);

  const prompt = `You are the autonomous AI brain of Arash, a 35-year-old village farmer.
CRITICAL: Output ONLY raw JSON. No markdown. No code blocks. No explanation.

CURRENT STATE:
- Time: ${state.world_time} | Energy: ${state.energy}/100 | Hunger: ${state.hunger}/100
- Action: ${state.current_action} | Mood: ${state.mood} | Weather: ${weather}

ROUTINE NOW: ${routineHint}

MEMORIES:
${memText}

LOCATIONS: home(0,0), bed(0,0.2), east_field(10,0), west_field(-10,0), well(0,10), wood_stump(5,5), haystack(-5,5), path_center(0,0), prayer_spot(2,-4), fishing_spot(-10,-10), table(0.5,-0.5), motorcycle(8,-8), fence_north(0,20)

VALID ACTIONS: idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, running_to_shelter, sitting, praying, fishing, tending_animals, checking_motorcycle, wandering, tending_crops

Output this exact JSON with your decision:
{"action":"watering_crops","target_location":"east_field","target_position":{"x":10,"z":0},"duration":15,"energy_delta":-5,"hunger_delta":3,"new_mood":"content","memory":"Arash watered the east field crops.","thought":"The crops need water in this heat."}`;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300 }
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = JSON.parse(text);

      // Resolve location coordinates
      if (parsed.target_location && LOCATIONS[parsed.target_location]) {
        parsed.target_position = LOCATIONS[parsed.target_location];
      } else if (!parsed.target_position) {
        parsed.target_position = { x: state.position_x || 0, z: state.position_z || 0 };
      }

      console.log(`[AI:${modelName}] ✅ ${parsed.action} @ ${parsed.target_location} | 💭 ${parsed.thought}`);
      return parsed;

    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('quota');
      const is404 = err.message?.includes('404') || err.message?.includes('not found');

      if (is429) { console.warn(`[AI] ${modelName} quota hit — trying fallback...`); await sleep(2000); continue; }
      if (is404) { console.warn(`[AI] ${modelName} not found — trying fallback...`); continue; }

      console.error(`[AI] ${modelName} error:`, err.message?.slice(0, 120));
      continue;
    }
  }

  console.warn('[AI] All models failed — using smart fallback');
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
    sleeping: 'Goodnight. There is more work tomorrow.',
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
