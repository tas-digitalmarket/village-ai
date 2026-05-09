require('dotenv').config();

const { processDirective } = require('./server/director');

async function test() {
  const state = {
    world_time: '08:15',
    current_action: 'idle',
    mood: 'content'
  };

  const memories = [
    { content: 'آرش امروز صبح کنار چاه ایستاد و به کارهای روز فکر کرد.' }
  ];

  const result = await processDirective('Every day at 09:00 water the east field, and do it now too.', state, memories);
  console.log('Directive parse:', JSON.stringify(result, null, 2));
}

test();
