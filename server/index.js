require('dotenv').config();
const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const cors      = require('cors');

const {
  initDatabase, getState, getMemories,
  getDirectives, addDirective, removeDirective, clearAllDirectives,
  getCreatorMessages, addCreatorMessage, addMemory
} = require('./database');
const { startScheduler } = require('./scheduler');
const { processDirective } = require('./director');
const { OPENROUTER_API_KEY, SAMBANOVA_API_KEY, CREATOR_TOKEN, DEBUG_ENABLED } = require('./config');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// Simple in-memory log buffer for debugging
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
    .replace(/"/g, '&quot;')
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

// ── WebSocket ──────────────────────────────────────────────────
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  // Send current state immediately on connect
  try {
    const state    = getState();
    const memories = getMemories(5);
    const directives = getDirectives();
    
    // Build schedule from directives + daily routine so it's not empty until first tick
    const { generateWeather } = require('./weather');
    const { buildUpcomingSchedule } = require('./scheduler');
    
    // We pass 1 for tick count to get current weather
    const weather = state.weather || generateWeather(1);
    const upcomingSchedule = buildUpcomingSchedule(directives, state.world_time || '06:00', weather);
    
    ws.send(JSON.stringify({ 
      type: 'state', 
      data: { ...state, memories, upcomingSchedule } 
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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// ── REST API — State & Logs ───────────────────────────────────
app.get('/api/state', (req, res) => {
  const state    = getState();
  const memories = getMemories(10);
  res.json({ ...state, memories });
});

app.get('/api/logs', (req, res) => {
  res.json(getMemories(50));
});

// ── REST API — Directives ─────────────────────────────────────
app.get('/api/directives', (req, res) => {
  const { buildUpcomingSchedule } = require('./scheduler');
  const state = getState();
  const upcomingSchedule = buildUpcomingSchedule(getDirectives(), state.world_time || '06:00', state.weather || 'sunny');
  res.json(upcomingSchedule);
});

app.post('/api/directive', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const state    = getState();
    const memories = getMemories(5);

    // Store creator's message
    addCreatorMessage('creator', message.trim());

    // Process with Gemini
    const result = await processDirective(message.trim(), state, memories);

    // Store Arash's response
    addCreatorMessage('arash', result.arash_response);

    // Add to Arash's memory
    if (result.memory) addMemory(result.memory);

    // Save each directive
    const savedDirectives = [];
    if (result.directives && result.directives.length > 0) {
      result.directives.forEach(d => {
        const saved = addDirective(d);
        savedDirectives.push(saved);
      });
    }

    // Handle immediate action — force a broadcast
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
          thought: result.immediate_action.thought || 'خالقم این را خواست...',
          memories: getMemories(5)
        }
      });
    }

    // Broadcast new directives to all clients
    const { buildUpcomingSchedule } = require('./scheduler');
    const upcomingSchedule = buildUpcomingSchedule(getDirectives(), state.world_time || '06:00', state.weather || 'sunny');
    broadcast({ type: 'directives', data: upcomingSchedule });

    // Broadcast the creator message
    broadcast({
      type: 'creator_message',
      data: {
        arash_response: result.arash_response,
        directives: savedDirectives
      }
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

// ── REST API — Creator Messages ───────────────────────────────
app.get('/api/creator-messages', (req, res) => {
  res.json(getCreatorMessages(30));
});

app.get('/api/debug/logs', requireCreatorAuth, (req, res) => {
  if (!DEBUG_ENABLED) {
    return res.status(404).json({ error: 'Debug logs are disabled' });
  }
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
  if (!DEBUG_ENABLED) {
    return res.status(404).json({ error: 'Debug AI test is disabled' });
  }
  const hasAiKey =
    (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MISSING_KEY') ||
    (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY !== 'MISSING_KEY');
  if (!hasAiKey) {
    return res.status(500).json({ error: 'AI API key is missing' });
  }
  try {
    const { askAI } = require('./ai');
    const result = await askAI(getState(), [], 'sunny');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ── Boot ──────────────────────────────────────────────────────
initDatabase();
startScheduler(broadcast);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌍 Village AI Server running on http://0.0.0.0:${PORT}`);
  console.log(`🤖 Arash is alive and thinking...\n`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});
