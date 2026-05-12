// Weighted random weather system. One scheduler tick is one world minute.
const WEATHER_POOL = [
  { type: 'sunny', weight: 0.45 },
  { type: 'cloudy', weight: 0.25 },
  { type: 'rainy', weight: 0.15 },
  { type: 'foggy', weight: 0.08 },
  { type: 'windy', weight: 0.05 },
  { type: 'stormy', weight: 0.02 }
];

let currentWeather = 'sunny';
let weatherTicksRemaining = 0;

function pickWeather() {
  const rand = Math.random();
  let cum = 0;
  for (const { type, weight } of WEATHER_POOL) {
    cum += weight;
    if (rand <= cum) return type;
  }
  return 'sunny';
}

function generateWeather() {
  if (weatherTicksRemaining > 0) {
    weatherTicksRemaining--;
    return currentWeather;
  }

  currentWeather = pickWeather();
  weatherTicksRemaining = Math.floor(Math.random() * 121) + 60; // 60-180 world minutes
  console.log(`[Weather] -> ${currentWeather} (lasts ${weatherTicksRemaining + 1} world minutes)`);
  return currentWeather;
}

function getCurrentWeather() {
  return currentWeather;
}

module.exports = { generateWeather, getCurrentWeather };
