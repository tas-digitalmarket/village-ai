require('dotenv').config();

const { askGemini } = require('./server/gemini');

async function test() {
  const state = {
    world_time: '09:00',
    energy: 70,
    hunger: 35,
    mood: 'content',
    current_action: 'idle',
    position_x: 0,
    position_z: 3
  };

  const memories = [
    { content: 'آرش صبح زود بیدار شد و هوای مزرعه را بررسی کرد.' }
  ];

  const schedule = [
    { time: '09:30', label: 'Water the east field', action: 'watering_crops', source: 'routine' }
  ];

  const result = await askGemini(state, memories, 'sunny', '09:00', schedule);
  console.log('AI decision:', JSON.stringify(result, null, 2));
}

test();
