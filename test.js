require('dotenv').config();

const { askGemini } = require('./server/gemini');

async function test() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required. Add it to .env before running this test.');
  }

  const state = {
    world_time: '12:00',
    energy: 50,
    hunger: 50,
    mood: 'neutral',
    position_x: 0,
    position_z: 0
  };

  const memories = [{ content: 'Woke up early.' }];
  const result = await askGemini(state, memories, 'sunny');
  console.log('RESULT:', JSON.stringify(result, null, 2));
}

test();
