require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const {
  initDatabase, getState, saveState, getMemories,
  getDirectives, addDirective, removeDirective, clearAllDirectives,
  getCreatorMessages, addCreatorMessage, addMemory
} = require('./database');
const { startScheduler, buildUpcomingSchedule } = require('./scheduler');
const { processDirective } = require('./director');
const { readWorldState } = require('./world-state');
const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY, CREATOR_TOKEN, DEBUG_ENABLED } = require('./config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();
const serverLogs = [];

for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    serverLogs.push(`[${level.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${args.join(' ')}`);
    if (serverLogs.length > 200) serverLogs.shift();
    original(...args);
  };
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRequestToken(req) {
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.get('x-creator-token') || '';
}

function requireCreatorAuth(req, res, next) {
  if (!CREATOR_TOKEN) return next();
  if (getRequestToken(req) !== CREATOR_TOKEN) {
    return res.status(401).json({ error: 'Creator token is required' });
  }
  next();
}

function buildStatePayload(memoryLimit = 5) {
  const state = getState();
  const directives = getDirectives();
  const upcomingSchedule = buildUpcomingSchedule(directives, state.world_time || '06:00', state.weather || 'sunny');
  return {
    ...state,
    world_state: readWorldState(),
    memories: getMemories(memoryLimit),
    upcomingSchedule
  };
}

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

wss.on('connection', ws => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  try {
    ws.send(JSON.stringify({ type: 'state', data: buildStatePayload(5) }));
    ws.send(JSON.stringify({ type: 'directives', data: buildStatePayload(1).upcomingSchedule }));
  } catch (err) {
    console.error('[WS] Failed to send initial state:', err.message);
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', err => {
    console.error('[WS] Error:', err.message);
    clients.delete(ws);
  });
});

app.get('/api/state', (req, res) => {
  res.json(buildStatePayload(10));
});

app.get('/api/logs', (req, res) => {
  res.json(getMemories(50));
});

app.get('/api/directives', (req, res) => {
  res.json(buildStatePayload(1).upcomingSchedule);
});

app.post('/api/directive', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

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
      const { LOCATIONS } = require('./gemini');
      const pos = LOCATIONS[result.immediate_action.location] || { x: 0, z: 0 };
      const currentState = getState();
      const newState = {
        ...currentState,
        current_action: result.immediate_action.action,
        position_x: pos.x,
        position_z: pos.z
      };
      saveState(newState);
      broadcast({
        type: 'state',
        data: {
          ...newState,
          world_state: readWorldState(),
          thought: result.immediate_action.thought || 'خالق از من خواسته و انجامش می‌دهم.',
          memories: getMemories(5),
          upcomingSchedule: buildUpcomingSchedule(getDirectives(), newState.world_time || '06:00', newState.weather || 'sunny')
        }
      });
    }

    const upcomingSchedule = buildUpcomingSchedule(getDirectives(), state.world_time || '06:00', state.weather || 'sunny');
    broadcast({ type: 'directives', data: upcomingSchedule });
    broadcast({
      type: 'creator_message',
      data: { arash_response: result.arash_response, directives: savedDirectives }
    });

    res.json({
      arash_response: result.arash_response,
      directives: savedDirectives,
      immediate_action: result.immediate_action || null
    });
  } catch (err) {
    console.error('[API] /api/directive error:', err.message);
    res.status(500).json({ error: 'Failed to process directive' });
  }
});

app.delete('/api/directive/:id', (req, res) => {
  removeDirective(req.params.id);
  const payload = buildStatePayload(1);
  broadcast({ type: 'directives', data: payload.upcomingSchedule });
  res.json({ ok: true });
});

app.delete('/api/directives', (req, res) => {
  clearAllDirectives();
  const payload = buildStatePayload(1);
  broadcast({ type: 'directives', data: payload.upcomingSchedule });
  res.json({ ok: true });
});

app.get('/api/creator-messages', (req, res) => {
  res.json(getCreatorMessages(30));
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
  try {
    const { askGemini } = require('./gemini');
    const result = await askGemini(getState(), [], 'sunny', undefined, undefined, readWorldState());
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
  console.log(`\nVillage AI Server running on http://0.0.0.0:${PORT}`);
  console.log('Arash is alive and thinking...\n');
});

server.on('error', err => {
  console.error('Server error:', err);
  process.exit(1);
});
