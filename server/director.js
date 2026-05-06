const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL } = require('./config');

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: 'v1' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MODELS = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-2.0-flash-lite'];

function extractJSON(text) {
  const stripped = text.replace(/```(?:json)?[\s\S]*?```/g, t =>
    t.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';

  const prompt = `You are Arash, a humble 35-year-old village farmer. Your Creator has spoken.
Output ONLY a raw JSON object. No markdown, no explanation.

CREATOR MESSAGE: "${message}"
YOUR STATE: Time ${state.world_time} | Action: ${state.current_action} | Mood: ${state.mood}
MEMORIES: ${memText}

Parse the Creator's message and:
- Extract time-based commands → add to directives array
- "daily"/"every day"/"هر روز"/"روزانه" → recurring: true
- "now"/"الان"/"فوری" → immediate_action
- No time mentioned → directives: []

VALID ACTIONS: idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, sitting, fishing, tending_animals, checking_motorcycle, wandering
VALID LOCATIONS: home, bed, table, east_field, west_field, well, wood_stump, haystack, path_center, fishing_spot, motorcycle

CRITICAL: arash_response MUST have BOTH English AND Persian separated by newline.
CRITICAL: If immediate_action is needed, it MUST include both 'action' and 'location'.

JSON format:
{"arash_response":"Yes my Creator, I will sleep at 10 PM every night as you commanded.\\nبله خالقم، هر شب ساعت ۱۰ شب می‌خوابم.","memory":"Creator commanded: sleep at 22:00 every night","directives":[{"time":"22:00","action":"sleeping","location":"bed","recurring":true,"label":"Sleep at 10 PM"}],"immediate_action":{"action":"sleeping","location":"bed"}}`;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = extractJSON(text);

      // Ensure bilingual — add Persian if missing
      if (parsed.arash_response && !/[\u0600-\u06FF]/.test(parsed.arash_response)) {
        parsed.arash_response += '\nبله خالقم، اطاعت می‌کنم.';
      }

      console.log(`[Director:${modelName}] ✅ Bilingual response ready`);
      return parsed;

    } catch (err) {
      const msg = err.message || String(err);
      console.error(`[Director] ${modelName} ERROR:`, msg.slice(0, 200));

      const is403 = msg.includes('403') || msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('permission');
      if (is403) { console.error('[Director] ❌ API KEY INVALID'); break; }

      const is429 = msg.includes('429') || msg.toLowerCase().includes('quota');
      if (is429) { await sleep(3000); continue; }
      continue;
    }
  }

  return {
    arash_response: 'Yes, my Creator. I have heard and will remember your words.\nبله خالقم، سخنت را شنیدم و به یاد خواهم سپرد.',
    memory: `Creator command: ${message.slice(0, 60)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
