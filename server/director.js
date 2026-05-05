// director.js — Creator ↔ Arash communication via Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'MISSING_KEY');

if (!process.env.GEMINI_API_KEY) {
  console.warn('[Director] ⚠️ WARNING: GEMINI_API_KEY is not set!');
}

const MODEL_CHAIN = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
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
- CURRENT ACTIVITY: ${state.current_action} (Arash is currently doing this)
- MOOD: ${state.mood}

RECENT MEMORIES:
${memText}

CREATOR MESSAGE (Directly to Arash): "${message}"

Your goal is to have Arash respond in a way that reflects HIS CURRENT SITUATION. If he is tired, he should sound tired. If he is working, he should mention it. Arash sees the Creator with deep reverence.

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

  // Fallback response if all models fail
  console.error(`[Director] All models in chain failed to respond for message: "${message}"`);
  return {
    arash_response: 'خالقم، در حال حاضر کمی سردرگم هستم، اما سخنت را در قلبم نگاه می‌دارم. (Gemini API Error)',
    memory: `Creator message received but AI processing failed: ${message.slice(0, 40)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
