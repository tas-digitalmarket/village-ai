// director.js — Creator ↔ Arash communication via Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const AVAILABLE_ACTIONS = [
  'idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting',
  'eating', 'sleeping', 'running_to_shelter', 'sitting', 'praying',
  'fishing', 'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'
];

const AVAILABLE_LOCATIONS = [
  'home', 'bed', 'east_field', 'west_field', 'well', 'wood_stump',
  'haystack', 'path_center', 'prayer_spot', 'fishing_spot', 'table',
  'motorcycle', 'fence_north'
];

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n');

  const prompt = `You are the bridge between Arash's Creator (God) and Arash — a humble 35-year-old Persian Muslim farmer.

The Creator has sent a directive. You must:
1. Interpret it in Arash's world context
2. Extract any SCHEDULED commands (specific times, recurring tasks)
3. Generate Arash's humble, in-character response in Persian
4. Return structured JSON

ARASH'S CURRENT STATE:
- World Time: ${state.world_time}
- Energy: ${state.energy}/100
- Hunger: ${state.hunger}/100
- Current Action: ${state.current_action}
- Mood: ${state.mood}

RECENT MEMORIES:
${memText}

CREATOR MESSAGE: "${message}"

AVAILABLE ACTIONS: ${AVAILABLE_ACTIONS.join(', ')}
AVAILABLE LOCATIONS: ${AVAILABLE_LOCATIONS.join(', ')}

HOW TO PARSE SCHEDULE COMMANDS:
- "sleep at 16:00" → directive: {time:"16:00", action:"sleeping", location:"bed", recurring:false, label:"Sleep at 4pm"}
- "pray at 12:00 every day" → directive: {time:"12:00", action:"praying", location:"prayer_spot", recurring:true, label:"Daily noon prayer"}
- "water crops at 6:30 from tomorrow" → directive: {time:"06:30", action:"watering_crops", location:"east_field", recurring:true, label:"Daily crop watering"}
- "fish today at 15:00" → directive: {time:"15:00", action:"fishing", location:"fishing_spot", recurring:false, label:"Go fishing"}
- "rest from 14:00 to 15:00" → directive: {time:"14:00", action:"sitting", location:"home", recurring:false, label:"Afternoon rest"}
- "do nothing" or just chat → directives: []

If message contains "immediately", "now", "right now" → set immediate:true and include the action.
If no time commands found → directives: []

Respond ONLY with this JSON (no markdown, no extra text):
{
  "arash_response": "Arash's humble Persian response to the Creator (2-3 sentences, reverent tone)",
  "memory": "Brief English note about this directive for Arash's memory log",
  "directives": [
    {
      "time": "HH:MM",
      "action": "action_name",
      "location": "location_name",
      "recurring": true_or_false,
      "label": "Brief English description (max 30 chars)"
    }
  ],
  "immediate_action": null
}

If immediate, set immediate_action to: {"action": "...", "location": "...", "thought": "Persian thought"}
Otherwise set immediate_action to null.`;

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[Director:${modelName}] Parsed ${parsed.directives?.length || 0} directives`);
      return parsed;
    } catch (err) {
      const is429 = err.message.includes('429') || err.message.includes('quota');
      const is404 = err.message.includes('404') || err.message.includes('not found');
      if (is429) { console.warn(`[Director] ${modelName} quota — trying next...`); await sleep(2000); continue; }
      if (is404) { console.warn(`[Director] ${modelName} not found — trying next...`); continue; }
      console.error(`[Director] ${modelName} error:`, err.message.slice(0, 120));
      break;
    }
  }

  // Fallback response
  return {
    arash_response: 'بله خالقم، سخنت را شنیدم. دستورت برای من قانون است.',
    memory: `Creator message: ${message.slice(0, 60)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
