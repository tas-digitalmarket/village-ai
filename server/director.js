const { SAMBANOVA_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL } = require('./config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MODELS = [PRIMARY_MODEL, FALLBACK_MODEL];

function extractJSON(text) {
  // Strip DeepSeek <think> blocks
  let stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  stripped = stripped.replace(/```(?:json)?[\s\S]*?```/g, t =>
    t.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  ).trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

async function processDirective(message, state, memories) {
  const memText = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No memories yet.';

  const systemPrompt = `تو آرش هستی؛ یک ویلیجر خودمختار در یک دهکده مجازی.
خالق تو (Creator) مستقیماً با تو صحبت کرده است.
به شدت به نظم و برنامه‌ریزی اهمیت می‌دهی، از تنهایی و سکوت لذت می‌بری. به عنوان آرش، باید پیام خالق را تحلیل کنی.
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
CRITICAL: If immediate_action is needed, it MUST include 'action', 'location', and a 'thought' (in Persian, reflecting Arash's obedience or reaction).

JSON format:
{"arash_response":"Yes my Creator, I will sleep at 10 PM every night as you commanded.\\nبله خالقم، هر شب ساعت ۱۰ شب می‌خوابم.","memory":"Creator commanded: sleep at 22:00 every night","directives":[{"time":"22:00","action":"sleeping","location":"bed","recurring":true,"label":"Sleep at 10 PM"}],"immediate_action":{"action":"sleeping","location":"bed","thought":"خالقم از من خواسته که الان بخوابم، پس اطاعت می‌کنم."}}`;

  for (const modelName of MODELS) {
    try {
      const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Parse the creator command and output JSON.' }
          ],
          temperature: 0.1,
          top_p: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content;
      const parsed = extractJSON(text);

      // Ensure bilingual — add Persian if missing
      if (parsed.arash_response && !/[\u0600-\u06FF]/.test(parsed.arash_response)) {
        parsed.arash_response += '\nبله خالقم، اطاعت می‌کنم.';
      }

      console.log(`[Director:${modelName}] ✅ Bilingual response ready`);
      return parsed;

    } catch (err) {
      const msg = err.message || String(err);
      const statusCode = msg.match(/HTTP (\d{3})/) ? parseInt(msg.match(/HTTP (\d{3})/)[1]) : 0;

      console.error(`[Director] ${modelName} ERROR: `, msg.slice(0, 120));

      if (statusCode === 401 || statusCode === 403) {
        console.error(`[Director] ❌ API KEY INVALID for ${modelName}`);
        continue;
      }
      if (statusCode === 429) {
        await sleep(3000);
        continue;
      }
      continue;
    }
  }

  return {
    arash_response: 'Yes, my Creator. I have heard and will remember your words.\nبله خالقم، سخنت را شنیدم و به یاد خواهم سپرد.',
    memory: \`Creator command: \${message.slice(0, 60)}\`,
    directives: [],
    immediate_action: null
  };
}

module.exports = { processDirective };
