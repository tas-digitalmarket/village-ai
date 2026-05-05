const { GEMINI_API_KEY } = require('./config');

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

// Ordered: best first, free fallbacks after
const MODELS = [
  { id: 'google/gemma-3-27b-it:free',           maxRetries: 2, delayMs: 3000 },
  { id: 'google/gemma-3-12b-it:free',           maxRetries: 2, delayMs: 2000 },
  { id: 'google/gemma-3-4b-it:free',            maxRetries: 2, delayMs: 2000 },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', maxRetries: 1, delayMs: 2000 },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', maxRetries: 1, delayMs: 2000 },
  { id: 'google/gemini-2.0-flash-001',          maxRetries: 1, delayMs: 0 },
];

// Strip markdown code fences and extract the JSON object
function extractJSON(text) {
  // Remove ```json ... ``` or ``` ... ```
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]);
}

async function callOpenRouter(modelId, prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GEMINI_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://village-ai.render.com',
      'X-Title': 'Village AI'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400
    })
  });

  if (!response.ok) {
    const err = await response.text();
    const code = response.status;
    throw Object.assign(new Error(`OpenRouter ${code}: ${err.slice(0, 120)}`), { code });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenRouter');
  return extractJSON(text);
}

async function askGemini(state, memories, weather) {
  const h = parseFloat((state.world_time || '08:00').replace(':', '.'));
  const memText = memories.slice(0, 6).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';
  const routineHint = getRoutineHint(h, weather, state);

  const prompt = `You are the autonomous AI brain of Arash, a 35-year-old village farmer.
CRITICAL: Output ONLY raw JSON. No markdown, no code blocks, no explanation.

CURRENT STATE:
- Time: ${state.world_time} | Energy: ${state.energy}/100 | Hunger: ${state.hunger}/100
- Action: ${state.current_action} | Mood: ${state.mood} | Weather: ${weather}

ROUTINE: ${routineHint}

RECENT MEMORIES:
${memText}

LOCATIONS: home(0,0), bed(0,0.2), east_field(10,0), west_field(-10,0), well(0,10), wood_stump(5,5), haystack(-5,5), path_center(0,0), prayer_spot(2,-4), fishing_spot(-10,-10), table(0.5,-0.5), motorcycle(8,-8), fence_north(0,20)

Respond with ONLY this JSON (no markdown):
{"action":"eating","target_location":"table","duration":15,"energy_delta":3,"hunger_delta":-15,"new_mood":"content","memory":"Arash ate breakfast at the table.","thought":"A good meal to start the day."}

Now generate your own decision for Arash's current situation:`;

  for (const { id, maxRetries, delayMs } of MODELS) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const parsed = await callOpenRouter(id, prompt);

        if (parsed.target_location && LOCATIONS[parsed.target_location]) {
          parsed.target_position = LOCATIONS[parsed.target_location];
        } else {
          parsed.target_position = { x: state.position_x || 0, z: state.position_z || 0 };
        }

        console.log(`[AI:${id}] ✅ ${parsed.action} | 💭 ${parsed.thought}`);
        return parsed;

      } catch (err) {
        const is429 = err.code === 429 || err.message.includes('429');
        const is402 = err.code === 402 || err.message.includes('402');
        const is404 = err.code === 404 || err.message.includes('404');

        if (is404) {
          console.warn(`[AI] ${id} not found — skipping`);
          break; // No point retrying a 404
        }
        if (is402) {
          console.warn(`[AI] ${id} needs credits — trying next model`);
          break;
        }
        if (is429 && attempt < maxRetries - 1) {
          console.warn(`[AI] ${id} rate limited — waiting ${delayMs}ms before retry ${attempt + 2}/${maxRetries}`);
          await sleep(delayMs);
          continue;
        }
        console.warn(`[AI] ${id} attempt ${attempt + 1} failed:`, err.message.slice(0, 80));
        if (attempt === maxRetries - 1) break;
      }
    }
  }

  console.warn('[AI] All models failed — using fallback routine');
  return buildFallbackAction(state, weather);
}

function getRoutineHint(h, weather, state) {
  if (weather === 'rainy' || weather === 'stormy') return 'Go inside immediately (running_to_shelter).';
  if (state.energy < 15) return 'CRITICAL: Sleep at bed immediately.';
  if (state.hunger > 85) return 'CRITICAL: Eat at table immediately.';
  if (h >= 22 || h < 4.5)  return 'Sleep at bed.';
  if (h >= 4.5 && h < 6)   return 'Wake up, morning prayer at prayer_spot.';
  if (h >= 6 && h < 9)     return 'Water the fields (watering_crops at east_field).';
  if (h >= 9 && h < 12)    return 'Chop wood at wood_stump.';
  if (h >= 12 && h < 12.5) return 'Noon prayer at prayer_spot.';
  if (h >= 12.5 && h < 14) return 'Lunch at table.';
  if (h >= 14 && h < 15.5) return 'Rest at home (sitting or sleeping).';
  if (h >= 15.5 && h < 16) return 'Afternoon prayer at prayer_spot.';
  if (h >= 16 && h < 18.5) return 'Harvest or tend crops in the fields.';
  if (h >= 18.5 && h < 19) return 'Sunset prayer at prayer_spot.';
  if (h >= 19 && h < 20)   return 'Dinner at table.';
  if (h >= 20 && h < 21)   return 'Sit outside at path_center and watch the stars.';
  if (h >= 21 && h < 21.5) return 'Night prayer at prayer_spot.';
  return 'Wind down, prepare for sleep.';
}

function buildFallbackAction(state, weather) {
  const h = parseFloat((state.world_time || '08:00').replace(':', '.'));
  let action = 'idle', loc = 'path_center';

  if (h >= 22 || h < 4.5)  { action = 'sleeping';      loc = 'bed'; }
  else if (h < 6)           { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 9)           { action = 'watering_crops'; loc = 'east_field'; }
  else if (h < 12)          { action = 'chopping_wood';  loc = 'wood_stump'; }
  else if (h < 12.5)        { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 14)          { action = 'eating';         loc = 'table'; }
  else if (h < 15.5)        { action = 'sitting';        loc = 'home'; }
  else if (h < 16)          { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 18.5)        { action = 'harvesting';     loc = 'east_field'; }
  else if (h < 19)          { action = 'praying';        loc = 'prayer_spot'; }
  else if (h < 20)          { action = 'eating';         loc = 'table'; }
  else if (h < 21)          { action = 'sitting';        loc = 'path_center'; }
  else if (h < 21.5)        { action = 'praying';        loc = 'prayer_spot'; }
  else                      { action = 'sleeping';        loc = 'bed'; }

  if (weather === 'rainy' || weather === 'stormy') { action = 'running_to_shelter'; loc = 'home'; }
  if (state.energy < 15) { action = 'sleeping'; loc = 'bed'; }
  if (state.hunger > 85) { action = 'eating';   loc = 'table'; }

  const pos = LOCATIONS[loc] || { x: 0, z: 0 };
  const thoughts = {
    sleeping: 'Goodnight. More work awaits tomorrow.',
    praying: 'Alhamdulillah, I am grateful.',
    eating: 'A blessing to have food.',
    watering_crops: 'The soil needs water.',
    chopping_wood: 'Hard work builds character.',
    harvesting: 'A good harvest, thanks be to God.',
    sitting: 'A moment to breathe.',
    walking: 'Fresh air clears the mind.',
    running_to_shelter: 'The rain comes — better get inside.'
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
