(() => {
  const WORLD_SECONDS_PER_REAL_MS = 60 / 2000;
  let baseClock = null;
  let syncing = false;

  function parseWorldMinutes(timeStr) {
    const [h = 6, m = 0] = String(timeStr || '06:00').split(':').map(Number);
    return h * 60 + m;
  }

  function readClock() {
    if (!baseClock) return null;
    const elapsedRealMs = Math.max(0, Date.now() - baseClock.timestampMs);
    const addedSeconds = Math.floor(elapsedRealMs * WORLD_SECONDS_PER_REAL_MS);
    const totalSeconds = baseClock.worldSeconds + addedSeconds;
    const day = baseClock.day + Math.floor(totalSeconds / 86400);
    const daySeconds = ((totalSeconds % 86400) + 86400) % 86400;
    const hour = Math.floor(daySeconds / 3600);
    const minute = Math.floor((daySeconds % 3600) / 60);
    const second = daySeconds % 60;

    return {
      day,
      text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
    };
  }

  function paintClock() {
    const clock = readClock();
    if (!clock) return;

    const dayEl = document.getElementById('stat-day');
    const timeEl = document.getElementById('stat-time');

    if (dayEl) dayEl.textContent = `Day ${clock.day}`;
    if (timeEl) {
      timeEl.textContent = clock.text;
      timeEl.dataset.smoothClock = '1';
    }
  }

  function patchHud() {
    if (!window.hud || window.hud.__smoothClockPatched) return;
    window.hud.__smoothClockPatched = true;
    window.hud.setTime = paintClock;
  }

  async function syncClock() {
    if (syncing) return;
    syncing = true;

    try {
      const res = await fetch(`/api/state?clock=${Date.now()}`);
      if (!res.ok) throw new Error(`Clock sync failed: ${res.status}`);

      const state = await res.json();
      baseClock = {
        day: Number(state.day) || 1,
        worldSeconds: parseWorldMinutes(state.world_time) * 60,
        timestampMs: state.timestamp ? new Date(state.timestamp).getTime() : Date.now()
      };

      window.__smoothClockStatus = { ok: true, syncedAt: Date.now(), sourceTime: state.world_time };
      patchHud();
      paintClock();
    } catch (err) {
      window.__smoothClockStatus = { ok: false, error: String(err) };
      console.warn('[ClockSmooth] sync failed', err);
    } finally {
      syncing = false;
    }
  }

  function frameLoop() {
    patchHud();
    paintClock();
    requestAnimationFrame(frameLoop);
  }

  console.log('[ClockSmooth] loaded');
  syncClock();
  setInterval(syncClock, 10000);
  setInterval(() => {
    patchHud();
    paintClock();
  }, 100);
  requestAnimationFrame(frameLoop);
})();
