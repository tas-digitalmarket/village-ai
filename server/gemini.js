const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001',
  'gemini-2.0-flash'
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Named Locations in the 3D World ─────────────────────────
// These coordinates map to exact spots in the Three.js scene
const LOCATIONS = {
  home:        { x:  0.0, z: -4.5 },  // front of cottage door
  bed:         { x: -2.5, z: -9.5 },  // inside cottage on bed
  east_field:  { x: -6.0, z:  7.0 },  // left farm plot
  west_field:  { x:  1.5, z:  8.5 },  // right farm plot
  well:        { x:  6.0, z:  2.0 },  // water well
  wood_stump:  { x: -3.0, z:  3.5 },  // chopping area
  haystack:    { x: -4.5, z:  5.5 },  // haystacks
  path_center: { x:  0.0, z:  2.0 },  // center of dirt path
  prayer_spot: { x:  1.0, z: -4.0 },  // near cottage
  fishing_spot:{ x:  8.5, z:  5.0 },  // corner
  table:       { x:  2.2, z: -9.0 },  // inside table
};

const LOCATION_GUIDE = Object.entries(LOCATIONS)
  .map(([name, pos]) => `  "${name}": x=${pos.x}, z=${pos.z}`)
  .join('\n');

async function askGemini(state, memories, weather) {
  const memText = memories.slice(0, 5).map((m, i) => `${i+1}. ${m.content}`).join('\n');

  const prompt = `You are the autonomous AI brain controlling Arash (آرش), a 35-year-old devout Persian village farmer.

═══ CHARACTER PROFILE ═══
- Name: Arash (آرش), age 35
- Personality: hardworking, faithful, calm, loves his land and animals
- Religion: Muslim — prays Fajr at dawn (05:00-06:00), Dhuhr at noon, Asr late afternoon, Maghrib at sunset
- Daily routine:
  05:00 → Fajr prayer (prayer_spot)
  06:00 → Water crops (east_field or west_field)
  08:00 → Chop wood or tend animals (wood_stump or haystack)
  10:00 → Continue farm work or harvest (east_field)
  12:30 → Eat lunch (home)
  13:00 → Rest/sit in shade (home or haystack)
  14:00 → Water crops again (well → east_field)
  16:00 → Asr prayer (prayer_spot)
  17:00 → Light chores or walk (path_center)
  19:00 → Maghrib prayer, then dinner (home)
  21:00 → Rest or sit outside (path_center)
  22:00 → Sleep (bed)

═══ WORLD LOCATIONS (use EXACT coordinates) ═══
${LOCATION_GUIDE}

═══ CURRENT STATE ═══
- World Time: ${state.world_time}
- Energy: ${state.energy}/100
- Hunger: ${state.hunger}/100
- Current Action: ${state.current_action}
- Current Position: x=${Number(state.position_x).toFixed(1)}, z=${Number(state.position_z).toFixed(1)}
- Weather: ${weather}
- Mood: ${state.mood}

═══ RECENT MEMORIES ═══
${memText}

═══ AVAILABLE ACTIONS ═══
idle, walking, chopping_wood, watering_crops, harvesting, eating,
sleeping, running_to_shelter, sitting, praying, fishing, tending_animals

═══ RULES ═══
- energy < 20 → MUST sleep at bed location
- hunger > 80 → MUST eat at home location  
- weather "rainy" or "stormy" → MUST go home (running_to_shelter to home)
- 22:00-04:59 → sleeping at bed
- 05:00-05:59 → praying at prayer_spot
- ALWAYS use coordinates from the LOCATIONS list above
- Each tick = 1 real minute = ~15 minutes in Arash's world
- Be consistent with the daily routine and previous memories
- If action requires movement, walk there first (use "walking" with target location)

Respond ONLY with this JSON (no markdown, no extra text):
{
  "action": "one_of_the_available_actions",
  "target_location": "location_name",
  "target_position": { "x": number, "z": number },
  "duration": minutes_as_integer,
  "energy_delta": integer_between_-15_and_8,
  "hunger_delta": integer_between_-5_and_12,
  "new_mood": "happy|content|tired|hungry|peaceful|worried|focused",
  "memory": "Short sentence (English or Persian) about what Arash just did or decided",
  "thought": "Arash's inner thought in Persian (1 sentence)"
}`;

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      const parsed = JSON.parse(jsonMatch[0]);

      // Override position with named location if provided
      if (parsed.target_location && LOCATIONS[parsed.target_location]) {
        parsed.target_position = LOCATIONS[parsed.target_location];
      }
      // Validate position exists
      if (!parsed.target_position) {
        parsed.target_position = { x: state.position_x || 0, z: state.position_z || 0 };
      }

      console.log(`[Gemini:${modelName}] → ${parsed.action} @ ${parsed.target_location || 'custom'} | 💭 ${parsed.thought}`);
      return parsed;

    } catch (err) {
      const is429 = err.message.includes('429') || err.message.includes('quota');
      const is404 = err.message.includes('404') || err.message.includes('not found');
      if (is429) { console.warn(`[Gemini] ${modelName} quota, trying next...`); await sleep(2000); continue; }
      if (is404) { console.warn(`[Gemini] ${modelName} not available, trying next...`); continue; }
      console.error(`[Gemini] ${modelName} error:`, err.message.slice(0, 100));
      break;
    }
  }

  // Fallback: follow daily routine automatically
  return buildFallbackAction(state, weather);
}

function buildFallbackAction(state, weather) {
  const [h] = (state.world_time || '08:00').split(':').map(Number);
  let action = 'idle', loc = 'path_center';

  if (h >= 22 || h < 5)       { action = 'sleeping';       loc = 'bed'; }
  else if (h >= 5 && h < 6)   { action = 'praying';        loc = 'prayer_spot'; }
  else if (h >= 6 && h < 9)   { action = 'watering_crops'; loc = 'east_field'; }
  else if (h >= 9 && h < 12)  { action = 'chopping_wood';  loc = 'wood_stump'; }
  else if (h >= 12 && h < 14) { action = 'eating';         loc = 'home'; }
  else if (h >= 14 && h < 17) { action = 'watering_crops'; loc = 'west_field'; }
  else if (h >= 16 && h < 17) { action = 'praying';        loc = 'prayer_spot'; }
  else if (h >= 17 && h < 20) { action = 'harvesting';     loc = 'east_field'; }
  else if (h >= 20 && h < 22) { action = 'sitting';        loc = 'home'; }

  if (weather === 'rainy' || weather === 'stormy') { action = 'running_to_shelter'; loc = 'home'; }
  if (state.energy < 20) { action = 'sleeping'; loc = 'bed'; }
  if (state.hunger > 80) { action = 'eating';   loc = 'home'; }

  const pos = LOCATIONS[loc];
  return {
    action,
    target_location: loc,
    target_position: pos,
    duration: 15,
    energy_delta: action === 'sleeping' ? 8 : action === 'eating' ? 2 : -3,
    hunger_delta: action === 'eating' ? -12 : 2,
    new_mood: 'content',
    memory: `آرش ${action} را در ${loc} انجام داد`,
    thought: 'به کارم ادامه می‌دهم...'
  };
}

module.exports = { askGemini, LOCATIONS };
