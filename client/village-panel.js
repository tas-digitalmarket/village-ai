const dialogueEl = document.getElementById('arash-aida-dialogue');
const pillEl = document.getElementById('arash-aida-pill');
const worldMoodEl = document.getElementById('world-status-mood');
const DIALOGUE_API = '/api/dialogue-log';
const BOTTOM_LOCK_THRESHOLD = 36;
const READING_HOLD_MS = 45000;

let lastDialogueKey = '';
let lastRenderedKey = '';
let latestMessages = [];
let allowDialogueWrite = false;
let userReadingUntil = 0;

function speakerKey(speaker) {
  return speaker === 'aida' ? 'aida' : 'arash';
}

function speakerLabel(speaker) {
  return speakerKey(speaker) === 'aida' ? 'Aida' : 'Arash';
}

function normalizeLines(lines = [], state = {}) {
  const fromState = Array.isArray(lines) ? lines : [];
  const clean = fromState
    .filter(line => line && line.text)
    .map(line => ({ speaker: speakerKey(line.speaker), text: String(line.text), world_time: line.world_time || state.world_time || '' }));

  return clean.slice(-6);
}

function messageKey(messages) {
  return messages.map(msg => `${msg.id || ''}:${msg.speaker}:${msg.text}:${msg.world_time || ''}`).join('|');
}

function isNearBottom() {
  if (!dialogueEl) return true;
  return dialogueEl.scrollHeight - dialogueEl.scrollTop - dialogueEl.clientHeight <= BOTTOM_LOCK_THRESHOLD;
}

function isUserReadingHistory() {
  return Date.now() < userReadingUntil || !isNearBottom();
}

function markUserReading() {
  if (!dialogueEl) return;
  if (!isNearBottom()) userReadingUntil = Date.now() + READING_HOLD_MS;
}

function lockDialogueElement() {
  if (!dialogueEl || dialogueEl.dataset.socialChatLocked === 'true') return;
  dialogueEl.dataset.socialChatLocked = 'true';

  const htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  const nativeReplaceChildren = Element.prototype.replaceChildren;

  if (htmlDescriptor?.get && htmlDescriptor?.set) {
    Object.defineProperty(dialogueEl, 'innerHTML', {
      configurable: true,
      get() {
        return htmlDescriptor.get.call(this);
      },
      set(value) {
        if (allowDialogueWrite) htmlDescriptor.set.call(this, value);
      }
    });
  }

  dialogueEl.replaceChildren = function replaceChildrenLocked(...children) {
    if (allowDialogueWrite) nativeReplaceChildren.apply(this, children);
  };
}

function withDialogueWrite(fn) {
  allowDialogueWrite = true;
  try {
    return fn();
  } finally {
    allowDialogueWrite = false;
  }
}

function renderMessages(messages = []) {
  if (!dialogueEl) return;
  const clean = messages.filter(msg => msg && msg.text).slice(-80);
  const key = messageKey(clean);
  const alreadyRendered = dialogueEl.querySelectorAll('.chat-message').length > 0;
  if (key && key === lastRenderedKey && alreadyRendered) return;

  const readingHistory = isUserReadingHistory();
  const shouldStayAtBottom = !readingHistory && isNearBottom();
  const previousDistanceFromBottom = dialogueEl.scrollHeight - dialogueEl.scrollTop;
  const previousScrollTop = dialogueEl.scrollTop;

  lastRenderedKey = key;
  latestMessages = clean;

  withDialogueWrite(() => {
    dialogueEl.replaceChildren();
    clean.slice(-40).forEach((msg) => {
      const row = document.createElement('div');
      const who = speakerKey(msg.speaker);
      row.className = `chat-message chat-message--${who}`;

      const name = document.createElement('strong');
      name.textContent = speakerLabel(who);

      const text = document.createElement('span');
      text.textContent = msg.text;

      const time = document.createElement('time');
      time.textContent = msg.world_time || '';

      row.append(name, text, time);
      dialogueEl.append(row);
    });
  });

  if (shouldStayAtBottom) {
    dialogueEl.scrollTop = dialogueEl.scrollHeight;
  } else if (readingHistory) {
    dialogueEl.scrollTop = Math.max(0, dialogueEl.scrollHeight - previousDistanceFromBottom);
  } else {
    dialogueEl.scrollTop = previousScrollTop;
  }

  if (pillEl) {
    const hasArash = clean.some(msg => speakerKey(msg.speaker) === 'arash');
    const hasAida = clean.some(msg => speakerKey(msg.speaker) === 'aida');
    pillEl.textContent = hasArash && hasAida ? 'conversation' : 'nearby';
  }
}

async function persistDialogue(lines, state = {}) {
  const normalized = normalizeLines(lines, state);
  const key = messageKey(normalized);
  if (!key || key === lastDialogueKey) return;
  lastDialogueKey = key;

  try {
    const res = await fetch(DIALOGUE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'overhead_bubble', lines: normalized })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.messages)) renderMessages(data.messages);
    }
  } catch (error) {
    renderMessages(normalized);
  }
}

function updateWorldMood(state = {}) {
  if (!worldMoodEl) return;
  const mode = state.risk_state?.mode || state.mood || 'steady';
  worldMoodEl.textContent = mode;
}

async function refreshVillagePanel() {
  try {
    const stateRes = await fetch('/api/state', { cache: 'no-store' });
    if (!stateRes.ok) return;
    const state = await stateRes.json();
    updateWorldMood(state);

    const lines = normalizeLines(state.social_dialogue || state.ida_state?.social_dialogue, state);
    await persistDialogue(lines, state);

    const messagesRes = await fetch(DIALOGUE_API, { cache: 'no-store' });
    if (messagesRes.ok) {
      const messages = await messagesRes.json();
      renderMessages(Array.isArray(messages) && messages.length ? messages : lines);
    } else {
      renderMessages(lines);
    }
  } catch (error) {
    if (latestMessages.length) renderMessages(latestMessages);
  }
}

function restoreChatIfNeeded() {
  if (!dialogueEl || !latestMessages.length) return;
  if (!dialogueEl.querySelector('.chat-message')) renderMessages(latestMessages);
}

if (dialogueEl) {
  lockDialogueElement();
  dialogueEl.addEventListener('scroll', markUserReading, { passive: true });
  dialogueEl.addEventListener('wheel', markUserReading, { passive: true });
  dialogueEl.addEventListener('touchmove', markUserReading, { passive: true });
  new MutationObserver(restoreChatIfNeeded).observe(dialogueEl, { childList: true });
}

refreshVillagePanel();
setInterval(refreshVillagePanel, 3000);
setInterval(restoreChatIfNeeded, 1000);
