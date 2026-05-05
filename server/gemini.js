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
const LOCATIONS = {
  home:         { x:  0.0, z: -4.5 },
  bed:          { x: -2.5, z: -9.5 },
  east_field:   { x: -6.0, z:  7.0 },
  west_field:   { x:  1.5, z:  8.5 },
  well:         { x:  6.0, z:  2.0 },
  wood_stump:   { x: -3.0, z:  3.5 },
  haystack:     { x: -4.5, z:  5.5 },
  path_center:  { x:  0.0, z:  2.0 },
  prayer_spot:  { x:  1.0, z: -4.0 },
  fishing_spot: { x:  8.5, z:  5.0 },
  table:        { x:  2.2, z: -9.0 },
  motorcycle:   { x:  5.0, z: -2.0 },
  fence_north:  { x:  0.0, z: 12.0 },
};

const LOCATION_GUIDE = Object.entries(LOCATIONS)
  .map(([name, pos]) => `  "${name}": x=${pos.x}, z=${pos.z}`)
  .join('\n');

async function askGemini(state, memories, weather) {
  const memText = memories.slice(0, 6).map((m, i) => `${i+1}. ${m.content}`).join('\n');
  const hour = parseInt((state.world_time || '08:00').split(':')[0]);
  const minute = parseInt((state.world_time || '08:00').split(':')[1] || '0');
  const timeDecimal = hour + minute / 60;

  // Routine hint for the AI
  const routineHint = getRoutineHint(timeDecimal, weather, state);

  const prompt = `You are the autonomous AI brain of Arash (آرش), a 35-year-old Persian village farmer living alone on his farm.

═══ CHARACTER PROFILE ═══
- Age: 35, devout Muslim, hardworking, calm, curious, loves nature
- Personality: Sometimes hums to himself, checks on his motorcycle with pride, watches the sky, picks wild herbs, sits alone thinking
- He has a BLACK Harley Davidson motorcycle he is very proud of (parked at motorcycle location)
- He has a cat he occasionally calls for
- He enjoys his morning tea ritual at the table before any work
- He is disciplined but has moods — sometimes works extra hard, sometimes takes a long break

═══ STRICT DAILY ROUTINE ═══
04:30-05:00  → Wake up, prepare for prayer (walking to prayer_spot)
05:00-06:00  → Fajr prayer (praying at prayer_spot) — MANDATORY
06:00-06:30  → Morning tea & breakfast at table (eating)
06:30-09:00  → Water east and west fields (watering_crops)
09:00-11:30  → Chop wood & tend farm (chopping_wood at wood_stump)
11:30-12:00  → Rest in shade near haystack (sitting)
12:00-12:30  → Dhuhr prayer (praying at prayer_spot) — MANDATORY
12:30-13:30  → Lunch at table (eating)
13:30-15:30  → Afternoon nap / rest at home (sleeping or sitting)
15:30-16:00  → Asr prayer (praying at prayer_spot) — MANDATORY
16:00-18:00  → Harvest or tend crops (harvesting/tending_crops at east_field)
18:00-18:30  → Walk the farm perimeter (walking around fence_north, path_center)
18:30-19:00  → Maghrib prayer at sunset (praying at prayer_spot) — MANDATORY
19:00-20:00  → Dinner at table (eating)
20:00-21:00  → Sit outside and watch stars (sitting at path_center)
21:00-21:30  → Isha prayer (praying at prayer_spot) — MANDATORY
21:30-22:00  → Wind down, prepare for sleep
22:00-04:30  → SLEEP at bed — MANDATORY

═══ SPONTANEOUS BEHAVIORS (decide randomly ~20% of ticks) ═══
- "checking_motorcycle": Go admire/polish the Harley (motorcycle location)
- "fishing": Go fish if near fishing_spot and energy > 50
- "tending_animals": Calling the cat, checking imaginary goats (haystack)
- "wandering": Walk to fence and back, observe the land
- "sitting": Sit and think somewhere unusual
- Pick moments to do something unexpected (not always work)

═══ WORLD STATE ═══
- Time: ${state.world_time} (decimal: ${timeDecimal.toFixed(2)})
- Energy: ${state.energy}/100
- Hunger: ${state.hunger}/100  
- Current action: ${state.current_action}
- Position: x=${Number(state.position_x).toFixed(1)}, z=${Number(state.position_z).toFixed(1)}
- Weather: ${weather}
- Mood: ${state.mood}

═══ ROUTINE SUGGESTION (follow unless AI decides to deviate) ═══
${routineHint}

═══ RECENT MEMORIES ═══
${memText}

═══ LOCATIONS ═══
${LOCATION_GUIDE}

═══ AVAILABLE ACTIONS ═══
idle, walking, chopping_wood, watering_crops, harvesting, eating,
sleeping, running_to_shelter, sitting, praying, fishing, tending_animals,
checking_motorcycle, wandering, tending_crops

═══ HARD RULES (never break) ═══
1. energy < 15 → MUST sleep at bed
2. hunger > 85 → MUST eat at home/table
3. weather "rainy" or "stormy" → MUST go inside (running_to_shelter to home)
4. 22:00-04:29 → sleeping at bed ONLY
5. Prayers (05:00, 12:00, 15:30, 18:30, 21:00) are MANDATORY — never skip
6. Always use exact coordinates from LOCATIONS list

Respond ONLY with this JSON (no markdown):
{
  "action": "one_of_the_available_actions",
  "target_location": "location_name",
  "target_position": { "x": number, "z": number },
  "duration": minutes_as_integer_5_to_30,
  "energy_delta": integer_between_-15_and_10,
  "hunger_delta": integer_between_-5_and_15,
  "new_mood": "happy|content|tired|hungry|peaceful|worried|focused|proud|curious",
  "memory": "Short English/Persian sentence about what Arash did",
  "thought": "Arash's inner thought in Persian (1 sentence, poetic or simple)"
}`;

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);

      // Always resolve named locations to coordinates
      if (parsed.target_location && LOCATIONS[parsed.target_location]) {
        parsed.target_position = LOCATIONS[parsed.target_location];
      }
      if (!parsed.target_position) {
        parsed.target_position = { x: state.position_x || 0, z: state.position_z || 0 };
      }

      console.log(`[Gemini:${modelName}] → ${parsed.action} @ ${parsed.target_location} | 💭 ${parsed.thought}`);
      return parsed;

    } catch (err) {
      const is429 = err.message.includes('429') || err.message.includes('quota');
      const is404 = err.message.includes('404') || err.message.includes('not found');
      if (is429) { console.warn(`[Gemini] ${modelName} quota — trying next...`); await sleep(2000); continue; }
      if (is404) { console.warn(`[Gemini] ${modelName} unavailable — trying next...`); continue; }
      console.error(`[Gemini] ${modelName} error:`, err.message.slice(0, 120));
      break;
    }
  }

  return buildFallbackAction(state, weather);
}

// ── Routine hint generator ────────────────────────────────────
function getRoutineHint(h, weather, state) {
  if (weather === 'rainy' || weather === 'stormy') return 'WEATHER EMERGENCY: Go inside immediately.';
  if (state.energy < 15) return 'CRITICAL: Energy too low — must sleep at bed NOW.';
  if (state.hunger > 85) return 'CRITICAL: Very hungry — must eat at table NOW.';

  if (h >= 22 || h < 4.5)  return 'Time to sleep — go to bed.';
  if (h >= 4.5 && h < 5)   return 'Wake up and walk to prayer spot for Fajr.';
  if (h >= 5 && h < 6)     return 'Fajr prayer time — pray at prayer_spot.';
  if (h >= 6 && h < 6.5)   return 'Morning tea and breakfast at the table.';
  if (h >= 6.5 && h < 9)   return 'Water the east and west fields.';
  if (h >= 9 && h < 11.5)  return 'Chop wood at the wood stump.';
  if (h >= 11.5 && h < 12) return 'Rest in shade near the haystack.';
  if (h >= 12 && h < 12.5) return 'Dhuhr prayer — go to prayer_spot.';
  if (h >= 12.5 && h < 13.5) return 'Lunch at the table inside.';
  if (h >= 13.5 && h < 15.5) return 'Afternoon rest at home — can nap or sit.';
  if (h >= 15.5 && h < 16) return 'Asr prayer time — pray at prayer_spot.';
  if (h >= 16 && h < 18)   return 'Harvest or tend crops in the fields.';
  if (h >= 18 && h < 18.5) return 'Evening walk around the farm.';
  if (h >= 18.5 && h < 19) return 'Maghrib prayer at sunset — prayer_spot.';
  if (h >= 19 && h < 20)   return 'Dinner time at the table.';
  if (h >= 20 && h < 21)   return 'Sit outside and enjoy the night sky.';
  if (h >= 21 && h < 21.5) return 'Isha prayer — pray at prayer_spot.';
  if (h >= 21.5 && h < 22) return 'Wind down — prepare for sleep.';
  return 'Follow the daily routine.';
}

// ── Reliable Fallback ─────────────────────────────────────────
function buildFallbackAction(state, weather) {
  const h = parseFloat((state.world_time || '08:00').replace(':', '.'));
  let action = 'idle', loc = 'path_center';

  if (h >= 22 || h < 4.5)  { action = 'sleeping';       loc = 'bed'; }
  else if (h < 5)           { action = 'walking';         loc = 'prayer_spot'; }
  else if (h < 6)           { action = 'praying';         loc = 'prayer_spot'; }
  else if (h < 6.5)         { action = 'eating';          loc = 'table'; }
  else if (h < 9)           { action = 'watering_crops';  loc = 'east_field'; }
  else if (h < 12)          { action = 'chopping_wood';   loc = 'wood_stump'; }
  else if (h < 12.5)        { action = 'praying';         loc = 'prayer_spot'; }
  else if (h < 13.5)        { action = 'eating';          loc = 'table'; }
  else if (h < 15.5)        { action = 'sleeping';        loc = 'bed'; }
  else if (h < 16)          { action = 'praying';         loc = 'prayer_spot'; }
  else if (h < 18)          { action = 'harvesting';      loc = 'east_field'; }
  else if (h < 18.5)        { action = 'walking';         loc = 'fence_north'; }
  else if (h < 19)          { action = 'praying';         loc = 'prayer_spot'; }
  else if (h < 20)          { action = 'eating';          loc = 'table'; }
  else if (h < 21)          { action = 'sitting';         loc = 'path_center'; }
  else if (h < 21.5)        { action = 'praying';         loc = 'prayer_spot'; }
  else                      { action = 'sleeping';         loc = 'bed'; }

  if (weather === 'rainy' || weather === 'stormy') { action = 'running_to_shelter'; loc = 'home'; }
  if (state.energy < 15) { action = 'sleeping'; loc = 'bed'; }
  if (state.hunger > 85) { action = 'eating';   loc = 'table'; }

  const pos = LOCATIONS[loc] || { x: 0, z: 0 };
  const thoughts = {
    sleeping: 'شب خیر، فردا کار زیاد است...',
    praying: 'الحمد لله، شکرگزارم.',
    eating: 'غذا نعمت خداست.',
    watering_crops: 'زمین تشنه است، باید آبش بدهم.',
    chopping_wood: 'هیزم برای زمستان لازم است.',
    harvesting: 'محصول خوبی است، خدا را شکر.',
    sitting: 'لحظه‌ای استراحت خوب است...',
    walking: 'هوای تازه خوب است.',
  };

  return {
    action,
    target_location: loc,
    target_position: pos,
    duration: 15,
    energy_delta: action === 'sleeping' ? 10 : action === 'eating' ? 3 : -3,
    hunger_delta: action === 'eating' ? -15 : 3,
    new_mood: 'content',
    memory: `آرش ${action} را در ${loc} انجام داد`,
    thought: thoughts[action] || 'به کارم ادامه می‌دهم...'
  };
}

module.exports = { askGemini, LOCATIONS };
