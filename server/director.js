const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL } = require('./config');

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MODELS = [PRIMARY_MODEL, FALLBACK_MODEL];

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';

  const prompt = `You are Arash, a humble 35-year-old village farmer. Your Creator (خالق) has spoken.
CRITICAL: Output ONLY raw JSON. No markdown. No code blocks.

CREATOR MESSAGE: "${message}"
YOUR STATE: Time ${state.world_time} | Action: ${state.current_action} | Mood: ${state.mood}
YOUR MEMORIES: ${memText}

INSTRUCTIONS:
- If the Creator's message mentions a time (e.g. "at 16:00", "at 10pm", "at ساعت ۱۶"), extract it as a directive.
- If it says "every day" / "daily" / "روزانه" / "هر شب" / "هر روز", set recurring: true.
- If it says "now" / "فوری" / "الان", create an immediate_action.
- If no time mentioned, set directives to [].

VALID ACTIONS: idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, sitting, praying, fishing, tending_animals, checking_motorcycle, wandering
VALID LOCATIONS: home, bed, table, east_field, west_field, well, wood_stump, haystack, path_center, prayer_spot, fishing_spot, motorcycle

IMPORTANT: Arash responds BILINGUALLY — first English, then Persian on the next line.

Output exactly this JSON format:
{"arash_response":"Yes my Creator, I will obey your command.\nبله خالقم، فرمانت را اطاعت می‌کنم.","memory":"Creator commanded: [brief description]","directives":[{"time":"22:00","action":"sleeping","location":"bed","recurring":true,"label":"Sleep at 10 PM"}],"immediate_action":null}

Now respond to the Creator's actual message: "${message}"`;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 500 }
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = JSON.parse(text);

      // Ensure bilingual response
      if (parsed.arash_response && !parsed.arash_response.includes('\n')) {
        // Model gave only one language — add Persian note
        if (!/[\u0600-\u06FF]/.test(parsed.arash_response)) {
          parsed.arash_response += '\nبله خالقم، اطاعت می‌کنم.';
        }
      }

      console.log(`[Director:${modelName}] ✅ Response ready`);
      return parsed;

    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('quota');
      const is404 = err.message?.includes('404') || err.message?.includes('not found');

      if (is429) { console.warn(`[Director] ${modelName} quota — trying fallback...`); await sleep(2000); continue; }
      if (is404) { console.warn(`[Director] ${modelName} not found — trying fallback...`); continue; }

      console.error(`[Director] ${modelName} error:`, err.message?.slice(0, 120));
      continue;
    }
  }

  return {
    arash_response: 'Yes, my Creator. I have heard and will remember your words.\nبله خالقم، سخنت را شنیدم و به یاد خواهم سپرد.',
    memory: `Creator command remembered: ${message.slice(0, 60)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
