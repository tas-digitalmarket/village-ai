require('dotenv').config();
const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const cors      = require('cors');

const {
  initDatabase, getState, getMemories,
  getAidaState,
  getDirectives, addDirective, removeDirective, clearAllDirectives,
  getCreatorMessages, addCreatorMessage, addMemory,
  getAidaMessages, addAidaMessage
} = require('./database');
const { readWorldState } = require('./world-state');
const { getSocialMessages, addSocialDialogueMessages } = require('./social-chat');
const { startScheduler } = require('./scheduler');
const { processDirective } = require('./director');
const { processAidaMessage } = require('./aida');
const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY, CREATOR_TOKEN, DEBUG_ENABLED } = require('./config');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const serverLogs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  serverLogs.push(`[LOG] ${new Date().toLocaleTimeString()}: ${args.join(' ')}`);
  if (serverLogs.length > 200) serverLogs.shift();
  originalLog.apply(console, args);
};
console.warn = (...args) => {
  serverLogs.push(`[WARN] ${new Date().toLocaleTimeString()}: ${args.join(' ')}`);
  if (serverLogs.length > 200) serverLogs.shift();
  originalWarn.apply(console, args);
};
console.error = (...args) => {
  serverLogs.push(`[ERR] ${new Date().toLocaleTimeString()}: ${args.join(' ')}`);
  if (serverLogs.length > 200) serverLogs.shift();
  originalError.apply(console, args);
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRequestToken(req) {
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.get('x-creator-token') || '';
}

function requireCreatorAuth(req, res, next) {
  if (!CREATOR_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'CREATOR_TOKEN is required in production' });
    }
    return next();
  }

  if (getRequestToken(req) !== CREATOR_TOKEN) {
    return res.status(401).json({ error: 'Creator token is required' });
  }

  next();
}

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  try {
    const state = getState();
    const aidaState = getAidaState();
    const memories = getMemories(5);
    const directives = getDirectives();
    const { generateWeather } = require('./weather');
    const { buildUpcomingSchedule } = require('./scheduler');
    const weather = state.weather || generateWeather(1);
    const upcomingSchedule = buildUpcomingSchedule(directives, state.world_time || '06:00', weather);
    const worldState = readWorldState();

    ws.send(JSON.stringify({
      type: 'state',
      data: { ...state, ida_state: aidaState, memories, upcomingSchedule, world_state: worldState, social_messages: getSocialMessages(40) }
    }));
    ws.send(JSON.stringify({ type: 'directives', data: directives }));
  } catch (e) {
    console.error('[WS] Failed to send initial state:', e.message);
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

app.get('/api/state', (req, res) => {
  const state = getState();
  const memories = getMemories(10);
  const worldState = readWorldState();
  res.json({ ...state, ida_state: getAidaState(), memories, world_state: worldState, social_messages: getSocialMessages(40) });
});

app.get('/api/social-messages', (req, res) => {
  res.json(getSocialMessages(80));
});

app.post('/api/social-messages', (req, res) => {
  const state = getState();
  const messages = addSocialDialogueMessages(req.body?.lines || [], {
    world_day: state.day,
    world_time: state.world_time,
    source: req.body?.source || 'overhead_bubble'
  });
  res.json({ ok: true, messages });
});

app.get('/api/logs', (req, res) => {
  res.json(getMemories(50));
});

app.get('/api/directives', (req, res) => {
  const { buildUpcomingSchedule } = require('./scheduler');
  const state = getState();
  const upcomingSchedule = buildUpcomingSchedule(getDirectives(), state.world_time || '06:00', state.weather || 'sunny');
  res.json(upcomingSchedule);
});

app.post('/api/directive', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  try {
    const state = getState();
    const memories = getMemories(5);
    addCreatorMessage('creator', message.trim());
    const result = await processDirective(message.trim(), state, memories);
    addCreatorMessage('arash', result.arash_response);
    if (result.memory) addMemory(result.memory);

    const savedDirectives = [];
    if (result.directives && result.directives.length > 0) {
      result.directives.forEach(d => savedDirectives.push(addDirective(d)));
    }

    if (result.immediate_action) {
      const { LOCATIONS } = require('./ai');
      const pos = LOCATIONS[result.immediate_action.location] || { x: 0, z: 0 };
      const currentState = getState();
      const newState = {
        ...currentState,
        current_action: result.immediate_action.action,
        position_x: pos.x,
        position_z: pos.z
      };
      const { saveState } = require('./database');
      saveState(newState);
      broadcast({
        type: 'state',
        data: {
          ...newState,
          ida_state: getAidaState(),
          thought: result.immediate_action.thought || 'خالقم این را خواست...',
          memories: getMemories(5),
          world_state: readWorldState(),
          social_messages: getSocialMessages(40)
        }
      });
    }

    const { buildUpcomingSchedule } = require('./scheduler');
    const upcomingSchedule = buildUpcomingSchedule(getDirectives(), state.world_time || '06:00', state.weather || 'sunny');
    broadcast({ type: 'directives', data: upcomingSchedule });
    broadcast({ type: 'creator_message', data: { arash_response: result.arash_response, directives: savedDirectives } });

    res.json({ arash_response: result.arash_response, directives: savedDirectives, immediate_action: result.immediate_action || null });
  } catch (err) {
    console.error('[API] /api/directive error:', err.message);
    res.status(500).json({ error: 'Failed to process directive' });
  }
});

app.delete('/api/directive/:id', (req, res) => {
  removeDirective(req.params.id);
  const { buildUpcomingSchedule } = require('./scheduler');
  const state = getState();
  const upcomingSchedule = buildUpcomingSchedule(getDirectives(), state.world_time || '06:00', state.weather || 'sunny');
  broadcast({ type: 'directives', data: upcomingSchedule });
  res.json({ ok: true });
});

app.delete('/api/directives', (req, res) => {
  clearAllDirectives();
  const { buildUpcomingSchedule } = require('./scheduler');
  const state = getState();
  const upcomingSchedule = buildUpcomingSchedule([], state.world_time || '06:00', state.weather || 'sunny');
  broadcast({ type: 'directives', data: upcomingSchedule });
  res.json({ ok: true });
});

app.get('/api/creator-messages', (req, res) => {
  res.json(getCreatorMessages(30));
});

app.get('/api/aida-messages', (req, res) => {
  res.json(getAidaMessages(30));
});

app.post('/api/aida-message', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  try {
    const clean = message.trim();
    addAidaMessage('creator', clean);
    const result = await processAidaMessage(clean);
    addAidaMessage('aida', result.aida_response);

    const payload = {
      aida_response: result.aida_response,
      ida_state: result.state || getAidaState()
    };

    broadcast({ type: 'aida_message', data: payload });
    broadcast({ type: 'state', data: { ...getState(), ida_state: payload.ida_state, memories: getMemories(5), world_state: readWorldState(), social_messages: getSocialMessages(40) } });
    res.json(payload);
  } catch (err) {
    console.error('[API] /api/aida-message error:', err.message);
    res.status(500).json({ error: 'Failed to process Aida message' });
  }
});

app.get('/api/debug/logs', requireCreatorAuth, (req, res) => {
  if (!DEBUG_ENABLED) return res.status(404).json({ error: 'Debug logs are disabled' });
  const apiKey = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY'
    ? OPENROUTER_API_KEY
    : SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY'
      ? SAMBANOVA_API_KEY
      : '';
  const maskedKey = apiKey ? apiKey.slice(0, 10) + '...' : 'MISSING';
  const escapedLogs = serverLogs.map(escapeHtml).join('\n');
  res.send(`
    <html><body style="background:#000;color:#0f0;font-family:monospace;padding:20px;">
      <h2>Village AI Server Logs (Key: ${escapeHtml(maskedKey)})</h2>
      <pre>${escapedLogs}</pre>
      <script>setTimeout(() => location.reload(), 5000);</script>
    </body></html>
  `);
});

app.get('/api/debug/test-ai', requireCreatorAuth, async (req, res) => {
  if (!DEBUG_ENABLED) return res.status(404).json({ error: 'Debug AI test is disabled' });
  const hasAiKey =
    (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY') ||
    (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY');
  if (!hasAiKey) return res.status(500).json({ error: 'AI API key is missing' });
  try {
    const { askAI } = require('./ai');
    const result = await askAI(getState(), [], 'sunny');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

initDatabase();
startScheduler(broadcast);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌍 Village AI Server running on http://0.0.0.0:${PORT}`);
  console.log(`🤖 Arash and Aida are alive and thinking...\n`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});
