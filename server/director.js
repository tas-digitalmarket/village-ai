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

The Creator has sent a DIRECTIVE. You must interpret it and extract any SCHEDULED tasks or IMMEDIATE commands.

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

STRICT RULES FOR DIRECTIVES:
1. "at HH:MM" or "at H pm/am" → Extract as a directive.
2. "every day", "daily", "each night" → Set recurring: true.
3. "now", "immediately", "right now" → Set immediate_action.
4. "tomorrow" → Just set recurring: false (unless "every day" is also present).
5. If the creator says "sleep at 10pm", translate 10pm to 22:00.
6. If no specific time is mentioned, return directives: [].

DIRECTIVE EXAMPLES:
- "Pray at 12:00 daily" → {time:"12:00", action:"praying", location:"prayer_spot", recurring:true, label:"Daily Noon Prayer"}
- "Go to bed at 11pm tonight" → {time:"23:00", action:"sleeping", location:"bed", recurring:false, label:"Sleep at 11 PM"}
- "Water crops at 06:30 every morning" → {time:"06:30", action:"watering_crops", location:"east_field", recurring:true, label:"Morning Watering"}
- "Fish at 15:00 today" → {time:"15:00", action:"fishing", location:"fishing_spot", recurring:false, label:"Go Fishing"}

Respond ONLY with this JSON structure:
{
  "arash_response": "Arash's humble Persian response (2 sentences, reverent tone)",
  "memory": "Brief English note for Arash's memory log",
  "directives": [
    {
      "time": "HH:MM",
      "action": "action_name",
      "location": "location_name",
      "recurring": true,
      "label": "Short description"
    }
  ],
  "immediate_action": { "action": "...", "location": "...", "thought": "Persian thought" } 
}

If no immediate action, set immediate_action to null.
If no scheduled directives, set directives to [].`;

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      console.log(`[Director:${modelName}] Raw response:`, text);
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[Director:${modelName}] Parsed ${parsed.directives?.length || 0} directives, Immediate: ${parsed.immediate_action ? 'Yes' : 'No'}`);
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
