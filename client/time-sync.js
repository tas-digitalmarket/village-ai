const WORLD_DAY_REAL_MINUTES = 48;
const WORLD_MINUTES_PER_REAL_MS = 1440 / (WORLD_DAY_REAL_MINUTES * 60 * 1000);

let baseClock = null;
let originalSetTime = null;

function parseWorldMinutes(timeStr) {
  const [h = 6, m = 0] = String(timeStr || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function formatClock() {
  if (!baseClock) return null;
  const elapsedMs = Date.now() - baseClock.timestampMs;
  const addMinutes = Math.max(0, Math.floor(elapsedMs * WORLD_MINUTES_PER_REAL_MS));
  const total = baseClock.worldMinutes + addMinutes;
  const day = baseClock.day + Math.floor(total / 1440);
  const dayMinutes = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(dayMinutes / 60);
  const minute = dayMinutes % 60;
  return {
    day,
    hour,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

function paintClock() {
  const clock = formatClock();
  if (!clock) return false;
  const dayEl = document.getElementById('stat-day');
  const timeEl = document.getElementById('stat-time');
  if (dayEl) dayEl.textContent = `Day ${clock.day}`;
  if (timeEl) timeEl.textContent = clock.time;
  return true;
}

function patchHudClock() {
  if (!window.hud || originalSetTime) return;
  originalSetTime = window.hud.setTime.bind(window.hud);
  window.hud.setTime = (...args) => {
    const clock = formatClock();
    if (!clock) return originalSetTime(...args);
    originalSetTime(clock.time, clock.hour);
    paintClock();
  };
}

async function syncFromServer() {
  const res = await fetch(`/api/state?clock=${Date.now()}`);
  if (!res.ok) return;
  const state = await res.json();
  baseClock = {
    day: Number(state.day) || 1,
    worldMinutes: parseWorldMinutes(state.world_time),
    timestampMs: state.timestamp ? new Date(state.timestamp).getTime() : Date.now()
  };
  patchHudClock();
  paintClock();
}

function paintLoop() {
  patchHudClock();
  paintClock();
  requestAnimationFrame(paintLoop);
}

syncFromServer().catch(() => {});
setInterval(() => syncFromServer().catch(() => {}), 5000);
requestAnimationFrame(paintLoop);
