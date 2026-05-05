require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { initDatabase, getState, getMemories } = require('./database');
const { startScheduler } = require('./scheduler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Connected WebSocket clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  // Send current state immediately on connect
  try {
    const state = getState();
    const memories = getMemories(5);
    ws.send(JSON.stringify({ type: 'state', data: { ...state, memories } }));
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

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// REST API
app.get('/api/state', (req, res) => {
  const state = getState();
  const memories = getMemories(10);
  res.json({ ...state, memories });
});

app.get('/api/logs', (req, res) => {
  res.json(getMemories(50));
});

// Health check for UptimeRobot
app.get('/health', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Initialize DB and start scheduler
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
