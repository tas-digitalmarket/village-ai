const { GEMINI_API_KEY } = require('./config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MODELS = [
  { id: 'google/gemma-3-27b-it:free',            maxRetries: 2, delayMs: 3000 },
  { id: 'google/gemma-3-12b-it:free',            maxRetries: 2, delayMs: 2000 },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', maxRetries: 1, delayMs: 2000 },
  { id: 'google/gemini-2.0-flash-001',           maxRetries: 1, delayMs: 0 },
];

function extractJSON(text) {
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
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw Object.assign(new Error(`OpenRouter ${response.status}: ${err.slice(0, 100)}`), { code: response.status });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response');
  return extractJSON(text);
}

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';

  const prompt = `You are Arash, a humble 35-year-old village farmer. Your Creator (خالق) has spoken to you.
CRITICAL: Output ONLY raw JSON. No markdown, no code blocks.

CREATOR'S MESSAGE: "${message}"
YOUR STATE: Time ${state.world_time}, Action: ${state.current_action}, Mood: ${state.mood}
MEMORIES: ${memText}

Parse the Creator's message:
- If it mentions a TIME (e.g. "at 16:00", "at 10pm", "at 22:00"), extract it as a directive.
- If it says "every day", "daily", "روزانه", set recurring: true.
- If it says "now" or "فوری", set immediate_action.
- If no time mentioned, directives = [].

AVAILABLE ACTIONS: idle, walking, chopping_wood, watering_crops, harvesting, eating, sleeping, running_to_shelter, sitting, praying, fishing, tending_animals, checking_motorcycle, wandering
AVAILABLE LOCATIONS: home, bed, table, east_field, west_field, well, wood_stump, haystack, path_center, prayer_spot, fishing_spot, motorcycle

IMPORTANT: Arash responds BILINGUALLY — first in English, then in Persian (Farsi).

Example output for "Sleep at 22:00 every night":
{"arash_response_en":"Yes my Creator, I will sleep at 10 PM every night as you have commanded. Your word is my guide.","arash_response_fa":"بله خالقم، هر شب ساعت ۲۲ می‌خوابم، چنانکه فرمودید. کلام شما راهنمای من است.","arash_response":"Yes my Creator, I will sleep at 10 PM every night. / بله خالقم، هر شب ساعت ۲۲ می‌خوابم.","memory":"Creator commanded: sleep at 22:00 every night","directives":[{"time":"22:00","action":"sleeping","location":"bed","recurring":true,"label":"Sleep at 10 PM"}],"immediate_action":null}

Now respond to: "${message}"`;

  for (const { id, maxRetries, delayMs } of MODELS) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const parsed = await callOpenRouter(id, prompt);

        // Build combined bilingual response if separate fields exist
        if (!parsed.arash_response && parsed.arash_response_en && parsed.arash_response_fa) {
          parsed.arash_response = `${parsed.arash_response_en}\n\n${parsed.arash_response_fa}`;
        } else if (!parsed.arash_response) {
          parsed.arash_response = 'Yes, my Creator. I will obey. / بله خالقم، اطاعت می‌کنم.';
        }

        console.log(`[Director:${id}] ✅ Response: ${parsed.arash_response?.slice(0, 60)}`);
        return parsed;
      } catch (err) {
        const is429 = err.code === 429 || err.message.includes('429');
        const is404 = err.code === 404 || err.message.includes('404');
        const is402 = err.code === 402 || err.message.includes('402');

        if (is404 || is402) { console.warn(`[Director] ${id} unavailable`); break; }
        if (is429 && attempt < maxRetries - 1) {
          console.warn(`[Director] ${id} rate limited — retrying after ${delayMs}ms`);
          await sleep(delayMs);
          continue;
        }
        console.warn(`[Director] ${id} failed:`, err.message.slice(0, 80));
        break;
      }
    }
  }

  return {
    arash_response: 'Yes, my Creator. I have heard your voice and will remember it. / بله خالقم، سخنت را شنیدم و به یاد خواهم سپرد.',
    memory: `Creator command remembered: ${message.slice(0, 60)}`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
