const { GEMINI_API_KEY, OPENROUTER_MODEL, OPENROUTER_FALLBACK } = require('./config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const AVAILABLE_ACTIONS = [
  'idle', 'walking', 'chopping_wood', 'watering_crops', 'harvesting', 'eating',
  'sleeping', 'running_to_shelter', 'sitting', 'praying', 'fishing', 'tending_animals',
  'checking_motorcycle', 'wandering', 'tending_crops'
];

const AVAILABLE_LOCATIONS = [
  'home', 'bed', 'east_field', 'west_field', 'well', 'wood_stump',
  'haystack', 'path_center', 'prayer_spot', 'fishing_spot', 'table',
  'motorcycle', 'fence_north'
];

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n');

  const prompt = `You are the bridge between Arash's Creator (God) and Arash — a humble 35-year-old village farmer.
The Creator has sent a DIRECTIVE: "${message}"

ARASH'S CURRENT STATE:
- World Time: ${state.world_time}
- CURRENT ACTIVITY: ${state.current_action}
- MOOD: ${state.mood}

Your goal: Extract SCHEDULED tasks or IMMEDIATE commands.
Arash MUST respond ONLY in English. NO PERSIAN.

Respond ONLY with this JSON structure:
{
  "arash_response": "Arash's humble response in ENGLISH",
  "memory": "Brief English note for memory log",
  "directives": [
    {
      "time": "HH:MM",
      "action": "action_name",
      "location": "location_name",
      "recurring": true,
      "label": "Short description"
    }
  ],
  "immediate_action": { "action": "...", "location": "...", "thought": "English thought" } 
}
If no immediate action, set immediate_action to null.
If no scheduled directives, set directives to [].`;

  const models = [
    OPENROUTER_MODEL, 
    'google/gemini-flash-1.5',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free'
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
      return parsed;

    } catch (err) {
      console.warn(`[Director] ${modelName} failed:`, err.message.slice(0, 100));
      await sleep(1000);
      continue;
    }
  }

  return {
    arash_response: 'Yes, my Creator. I have heard your voice and will obey. (OpenRouter Error)',
    memory: `Creator message received but AI processing failed: ${message.slice(0, 40)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
