const { GEMINI_API_KEY, OPENROUTER_MODEL, OPENROUTER_FALLBACK } = require('./config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const LOCATIONS = {
  home: { x: 0, z: 0 },
  bed: { x: 0, z: 0.2 },
  east_field: { x: 10, z: 0 },
  west_field: { x: -10, z: 0 },
  well: { x: 0, z: 10 },
  wood_stump: { x: 5, z: 5 },
  haystack: { x: -5, z: 5 },
  path_center: { x: 0, z: 0 },
  prayer_spot: { x: 2, z: -4 },
  fishing_spot: { x: -10, z: -10 },
  table: { x: 0.5, z: -0.5 },
  motorcycle: { x: 8, z: -8 },
  fence_north: { x: 0, z: 20 }
};

async function askGemini(state, memories, weather) {
  const timeDecimal = parseFloat((state.world_time || '08:00').replace(':', '.'));
  const memText = memories.slice(0, 8).map((m, i) => `${i + 1}. ${m.content}`).join('\n');
  const routineHint = getRoutineHint(timeDecimal, weather, state);

  const prompt = `You are the autonomous AI brain of Arash, a 35-year-old village farmer.
Everything you output MUST be in English. NO PERSIAN.

CHARACTER: Hardworking, peaceful, religious, loves his Harley motorcycle.
CURRENT WORLD TIME: ${state.world_time}
STATS: Energy ${state.energy}/100, Hunger ${state.hunger}/100, Mood: ${state.mood}
CURRENT ACTION: ${state.current_action}
WEATHER: ${weather}

ROUTINE GUIDE: ${routineHint}

RECENT MEMORIES:
${memText}

LOCATIONS:
${Object.entries(LOCATIONS).map(([name, pos]) => `- ${name}: x:${pos.x}, z:${pos.z}`).join('\n')}

Respond ONLY with this JSON structure:
{
  "action": "walking|chopping_wood|watering_crops|harvesting|eating|sleeping|sitting|praying|fishing|tending_animals|checking_motorcycle|wandering",
  "target_location": "location_name",
  "duration": 15,
  "energy_delta": -5,
  "hunger_delta": 5,
  "new_mood": "happy|content|tired|peaceful|proud",
  "memory": "Short English sentence describing the action",
  "thought": "Arash's inner thought in English"
}`;

  const models = [
    OPENROUTER_MODEL, 
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'openchat/openchat-7b:free'
  ];
  
  for (const modelName of models) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://village-ai.render.com',
          'X-Title': 'Village AI'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter Error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content.trim();
      const parsed = JSON.parse(text);

      if (parsed.target_location && LOCATIONS[parsed.target_location]) {
        parsed.target_position = LOCATIONS[parsed.target_location];
      } else {
        parsed.target_position = { x: state.position_x || 0, z: state.position_z || 0 };
      }

      console.log(`[AI:${modelName}] → ${parsed.action} | 💭 ${parsed.thought}`);
      return parsed;

    } catch (err) {
      console.warn(`[AI] ${modelName} failed:`, err.message.slice(0, 100));
      await sleep(1000);
      continue;
    }
  }

  return buildFallbackAction(state, weather);
}

function getRoutineHint(h, weather, state) {
  if (weather === 'rainy' || weather === 'stormy') return 'Go home immediately.';
  if (state.energy < 15) return 'Must sleep at bed.';
  if (state.hunger > 85) return 'Must eat at table.';
  if (h >= 22 || h < 5) return 'Time to sleep.';
  if (h >= 5 && h < 6) return 'Morning prayer.';
  if (h >= 6 && h < 9) return 'Farm work.';
  return 'Daily routine.';
}

function buildFallbackAction(state, weather) {
  return {
    action: 'idle',
    target_location: 'path_center',
    target_position: { x: 0, z: 0 },
    duration: 15,
    energy_delta: -2,
    hunger_delta: 2,
    new_mood: 'peaceful',
    memory: 'Arash rested for a moment.',
    thought: 'Taking a breath...'
  };
}

module.exports = { askGemini, LOCATIONS };
