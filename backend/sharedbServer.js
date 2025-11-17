import ShareDB from 'sharedb';
import WebSocket from 'ws';
import WebSocketJSONStream from '@teamwork/websocket-json-stream';
import { getWikiPage, saveWikiPage } from './wikiParser.js';

// Create ShareDB backend with in-memory database
// For production, you'd use sharedb-mongo or another persistent backend
const backend = new ShareDB();

// Map to track active connections and their user info
const connections = new Map();

/**
 * Setup ShareDB WebSocket server
 * @param {WebSocketServer} wss - WebSocket server instance
 */
export function setupShareDBWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const url = req.url;

    // Handle presence connections separately
    if (url === '/presence') {
      console.log('👥 Presence client connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);

          if (data.type === 'user-info') {
            connections.set(ws, {
              userId: data.userId,
              userName: data.userName,
              color: data.color,
              filename: data.filename,
              cursorPosition: data.cursorPosition || 0,
              selectionEnd: data.selectionEnd || 0
            });
            broadcastPresence(wss);
          } else if (data.type === 'cursor-update') {
            // Update cursor position for this connection
            const userInfo = connections.get(ws);
            if (userInfo) {
              userInfo.cursorPosition = data.cursorPosition;
              userInfo.selectionEnd = data.selectionEnd;
              userInfo.filename = data.filename;
              broadcastPresence(wss);
            }
          }
        } catch (err) {
          console.error('Error handling presence message:', err);
        }
      });

      ws.on('close', () => {
        console.log('👥 Presence client disconnected');
        connections.delete(ws);
        broadcastPresence(wss);
      });

      return;
    }

    // Handle ShareDB connections
    console.log('📡 ShareDB client connected');

    // Create a ShareDB stream from the WebSocket
    const stream = new WebSocketJSONStream(ws);

    // Connect ShareDB to the stream
    backend.listen(stream);

    ws.on('close', () => {
      console.log('📡 ShareDB client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  // Setup middleware to sync ShareDB documents with file system
  backend.use('apply', async (context, next) => {
    // After an operation is applied, save to file system
    const { collection, id, op } = context;

    if (collection === 'wiki-pages') {
      try {
        // Extract sessionId and filename from document ID (format: sessionId/filename)
        const parts = id.split('/');
        if (parts.length !== 2) {
          console.error('Invalid document ID format:', id);
          return next();
        }

        const [sessionId, filename] = parts;

        // Get the document
        const doc = backend.connect().get(collection, id);
        await new Promise((resolve) => {
          doc.fetch((err) => {
            if (err) {
              console.error('Error fetching document:', err);
              return resolve();
            }

            // Save to file system with sessionId
            if (doc.data) {
              saveWikiPage(filename, doc.data, sessionId).catch(err => {
                console.error(`Error saving ${filename}:`, err.message);
              });
            }
            resolve();
          });
        });
      } catch (err) {
        console.error('Error in apply middleware:', err);
      }
    }

    next();
  });
  
  console.log('✅ ShareDB WebSocket server initialized');
}

/**
 * Broadcast presence information to all connected clients
 */
function broadcastPresence(wss) {
  const users = Array.from(connections.values());
  const message = JSON.stringify({
    type: 'presence',
    users: users
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Get ShareDB backend instance
 */
export function getShareDBBackend() {
  return backend;
}

