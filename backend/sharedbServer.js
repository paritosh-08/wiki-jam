import ShareDB from 'sharedb';
import { createRequire } from 'module';
import WebSocket from 'ws';
import WebSocketJSONStream from '@teamwork/websocket-json-stream';
import { getWikiPage, saveWikiPage } from './wikiParser.js';

// Use require for CommonJS module
const require = createRequire(import.meta.url);
const ShareDBPostgres = require('sharedb-postgres');

// Create ShareDB backend with PostgreSQL database for persistence
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'wiki_jam',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

console.log('🔧 Initializing ShareDB with PostgreSQL:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user
});

const db = new ShareDBPostgres(dbConfig);

const backend = new ShareDB({ db });

console.log('✅ ShareDB backend created with PostgreSQL database');

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

  // Setup middleware to load documents from file system if they don't exist in ShareDB yet
  backend.use('readSnapshots', async (context, next) => {
    const { collection, snapshots } = context;

    if (collection === 'wiki-pages') {
      // Process each snapshot request
      for (const snapshot of snapshots) {
        // If document doesn't exist in ShareDB (type is null), try loading from disk
        if (snapshot.type === null && snapshot.id) {
          try {
            const parts = snapshot.id.split('/');
            if (parts.length === 2) {
              const [sessionId, filenameWithSuffix] = parts;

              // Check if this is a field-specific document (e.g., "page.hml-definition")
              let actualFilename = filenameWithSuffix;
              let fieldName = null;

              if (filenameWithSuffix.endsWith('-definition')) {
                actualFilename = filenameWithSuffix.replace('-definition', '');
                fieldName = 'definition';
              } else if (filenameWithSuffix.endsWith('-details')) {
                actualFilename = filenameWithSuffix.replace('-details', '');
                fieldName = 'details';
              }

              const pageData = await getWikiPage(actualFilename, sessionId);

              if (pageData) {
                let content = '';
                if (fieldName) {
                  // Load specific field
                  content = pageData[fieldName] || '';
                  console.log(`📂 Loading ${actualFilename} field "${fieldName}" from disk into ShareDB`);
                } else {
                  // Load raw content for full page
                  content = pageData.rawContent || '';
                  console.log(`📂 Loading ${actualFilename} from disk into ShareDB`);
                }

                // Set the snapshot data to load from file
                snapshot.type = 'json0';
                snapshot.v = 1;
                snapshot.data = { content };
              }
            }
          } catch (err) {
            console.error(`Error loading ${snapshot.id} from disk:`, err);
          }
        }
      }
    }

    next();
  });

  // Setup middleware to sync ShareDB documents with file system
  backend.use('apply', async (context, next) => {
    // After an operation is applied, save to file system
    const { collection, id } = context;

    console.log(`📝 ShareDB apply middleware called: collection=${collection}, id=${id}`);

    if (collection === 'wiki-pages') {
      try {
        // Extract sessionId and filename from document ID (format: sessionId/filename)
        const parts = id.split('/');
        if (parts.length !== 2) {
          console.error('Invalid document ID format:', id);
          return next();
        }

        const [sessionId, filenameWithSuffix] = parts;

        // Check if this is a field-specific document (e.g., "page.hml-definition")
        let actualFilename = filenameWithSuffix;
        let fieldName = null;

        if (filenameWithSuffix.endsWith('-definition')) {
          actualFilename = filenameWithSuffix.replace('-definition', '');
          fieldName = 'definition';
        } else if (filenameWithSuffix.endsWith('-details')) {
          actualFilename = filenameWithSuffix.replace('-details', '');
          fieldName = 'details';
        }

        console.log(`💾 Attempting to save ${actualFilename}${fieldName ? ` field "${fieldName}"` : ''} for session ${sessionId}`);

        // Get the document
        const doc = backend.connect().get(collection, id);
        await new Promise((resolve) => {
          doc.fetch(async (err) => {
            if (err) {
              console.error('Error fetching document:', err);
              return resolve();
            }

            // Save to file system with sessionId
            if (doc.data && doc.data.content !== undefined) {
              try {
                if (fieldName) {
                  // For field-specific documents, we need to read the existing page,
                  // update the specific field, and save it back
                  const existingPage = await getWikiPage(actualFilename, sessionId);
                  const pageData = existingPage || {};

                  // Update the specific field
                  pageData[fieldName] = doc.data.content;

                  // Save the updated page
                  await saveWikiPage(actualFilename, pageData, sessionId);
                  console.log(`💾 Saved ${actualFilename} field "${fieldName}" to disk`);
                } else {
                  // For full page documents, save the content directly
                  await saveWikiPage(actualFilename, doc.data, sessionId);
                  console.log(`💾 Saved ${actualFilename} to disk`);
                }
              } catch (saveErr) {
                console.error(`Error saving ${actualFilename}:`, saveErr.message);
              }
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

