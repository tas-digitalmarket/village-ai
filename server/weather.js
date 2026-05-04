// Weighted random weather system
const WEATHER_POOL = [
  { type: 'sunny',  weight: 0.45 },
  { type: 'cloudy', weight: 0.25 },
  { type: 'rainy',  weight: 0.15 },
  { type: 'foggy',  weight: 0.08 },
  { type: 'windy',  weight: 0.05 },
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

function generateWeather(tick) {
  if (weatherTicksRemaining > 0) {
    weatherTicksRemaining--;
    return currentWeather;
  }
  currentWeather = pickWeather();
  weatherTicksRemaining = Math.floor(Math.random() * 6) + 1; // 1–6 ticks
  console.log(`[Weather] → ${currentWeather} (lasts ${weatherTicksRemaining + 1} ticks)`);
  return currentWeather;
}

function getCurrentWeather() { return currentWeather; }

module.exports = { generateWeather, getCurrentWeather };
