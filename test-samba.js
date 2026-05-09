require('dotenv').config();
const { askGemini } = require('./server/gemini');

async function test() {
  process.env.SAMBANOVA_API_KEY = '337c8305-e3f1-43c7-9ded-56dd19f9fa1d';
  console.log('Testing askGemini with SambaNova...');
  const state = {
    world_time: '12:00',
    energy: 50,
    hunger: 50,
    mood: 'neutral'
  };
  const memories = [{ content: 'Woke up early.' }];
  const result = await askGemini(state, memories, 'sunny');
  console.log('RESULT:', result);
}
test();
