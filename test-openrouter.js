require('dotenv').config();
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required. Add it to .env before running this test.');
}
const { askGemini } = require('./server/gemini');

async function test() {
  console.log('Testing askGemini with OpenRouter...');
  const state = {
    world_time: '12:00',
    energy: 50,
    hunger: 50,
    mood: 'neutral'
  };
  const memories = [{ content: 'Woke up early.' }];
  const result = await askGemini(state, memories, 'sunny');
  console.log('RESULT:', JSON.stringify(result, null, 2));
}
test();
