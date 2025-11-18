import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { setupShareDBWebSocket } from './sharedbServer.js';
import { wikiRouter } from './routes/wiki.js';
import { sessionRouter } from './routes/session.js';
import { initializeDatabase } from './db.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/wiki', wikiRouter);
app.use('/api/session', sessionRouter);

// Setup ShareDB WebSocket server
setupShareDBWebSocket(wss);

const PORT = process.env.PORT || 3001;

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database schema
    await initializeDatabase();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server ready for connections`);
      console.log(`🗄️  PostgreSQL database connected`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

