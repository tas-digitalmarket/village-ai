const WORLD_SECONDS_PER_REAL_MS = 60 / 2000;
let baseClock = null;

function parseWorldMinutes(timeStr) {
  const [h = 6, m = 0] = String(timeStr || '06:00').split(':').map(Number);
  return h * 60 + m;
}

function readClock() {
  if (!baseClock) return null;
  const addedSeconds = Math.max(0, Math.floor((Date.now() - baseClock.timestampMs) * WORLD_SECONDS_PER_REAL_MS));
  const totalSeconds = baseClock.worldSeconds + addedSeconds;
  const day = baseClock.day + Math.floor(totalSeconds / 86400);
  const daySeconds = ((totalSeconds % 86400) + 86400) % 86400;
  const hour = Math.floor(daySeconds / 3600);
  const minute = Math.floor((daySeconds % 3600) / 60);
  const second = daySeconds % 60;
  return {
    day,
    hour,
    text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  };
}

function paintClock() {
  const clock = readClock();
  if (!clock) return;
  const dayEl = document.getElementById('stat-day');
  const timeEl = document.getElementById('stat-time');
  if (dayEl) dayEl.textContent = `Day ${clock.day}`;
  if (timeEl) timeEl.textContent = clock.text;
}

function patchHud() {
  if (!window.hud || window.hud.__smoothClockPatched) return;
  window.hud.__smoothClockPatched = true;
  window.hud.setTime = () => paintClock();
}

async function syncClock() {
  try {
    const res = await fetch(`/api/state?clock=${Date.now()}`);
    if (!res.ok) return;
    const state = await res.json();
    baseClock = {
      day: Number(state.day) || 1,
      worldSeconds: parseWorldMinutes(state.world_time) * 60,
      timestampMs: state.timestamp ? new Date(state.timestamp).getTime() : Date.now()
    };
    patchHud();
    paintClock();
  } catch (err) {
    // Keep the last good clock if a sync request fails.
  }
}

function afterFrameLoop() {
  setTimeout(() => {
    patchHud();
    paintClock();
    requestAnimationFrame(afterFrameLoop);
  }, 0);
}

syncClock();
setInterval(syncClock, 10000);
requestAnimationFrame(afterFrameLoop);
