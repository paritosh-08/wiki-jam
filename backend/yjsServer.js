import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as map from 'lib0/map';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveSession, getSessionFromDB, deleteSessionFromDB } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base path for all session directories
// In Docker: /app/sessions, In local dev: /path/to/wiki-editor/backend/../sessions
const SESSIONS_BASE_PATH = process.env.NODE_ENV === 'production'
  ? path.resolve(__dirname, 'sessions')
  : path.resolve(__dirname, '..', 'sessions');

// Store Yjs documents in memory (one per session-page combination)
const docs = new Map();
const docAwareness = new Map();

// Store session metadata
const sessions = new Map();

export function setupYjsWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection request:', req.url);

    // y-websocket sends the room name as part of the path: /roomName
    // Extract the document name from the URL path
    let docName = req.url.slice(1).split('?')[0]; // Remove leading '/' and query params

    // Decode URI component in case it has special characters
    docName = decodeURIComponent(docName);

    if (!docName) {
      console.log('No document name provided, closing connection');
      ws.close();
      return;
    }

    console.log(`📝 New connection for document: ${docName}`);

    // Get or create document and awareness
    const doc = getOrCreateDoc(docName);
    const awareness = map.setIfUndefined(docAwareness, docName, () => new awarenessProtocol.Awareness(doc));

    ws.binaryType = 'arraybuffer';

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const uint8Message = new Uint8Array(message);
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(uint8Message);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case syncProtocol.messageYjsSyncStep1:
            console.log(`Received SyncStep1 for ${docName}`);
            encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);
            syncProtocol.writeSyncStep1(decoder, encoder, doc);
            const syncStep2Message = encoding.toUint8Array(encoder);
            if (ws.readyState === 1) {
              ws.send(syncStep2Message, (err) => {
                if (err) console.error('Error sending SyncStep2:', err);
              });
            }
            break;
          case syncProtocol.messageYjsSyncStep2:
            console.log(`Received SyncStep2 for ${docName}`);
            syncProtocol.readSyncStep2(decoder, doc, null);
            break;
          case syncProtocol.messageYjsUpdate:
            console.log(`Received Update for ${docName}`);
            syncProtocol.readUpdate(decoder, doc, null);
            // Broadcast to all other clients
            broadcastMessage(wss, ws, docName, uint8Message);
            break;
          case awarenessProtocol.messageAwareness:
            console.log(`Received Awareness for ${docName}`);
            awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
            // Broadcast awareness to all other clients
            broadcastMessage(wss, ws, docName, uint8Message);
            break;
          default:
            console.log(`Unknown message type: ${messageType}`);
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for ${docName}:`, err);
    });

    ws.on('close', () => {
      console.log(`Connection closed for ${docName}`);
      // Remove awareness state
      awarenessProtocol.removeAwarenessStates(awareness, [ws], null);
    });

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
    syncProtocol.writeSyncStep1(encoder, doc);
    const syncStep1Message = encoding.toUint8Array(encoder);
    ws.send(syncStep1Message, (err) => {
      if (err) console.error('Error sending SyncStep1:', err);
      else console.log(`Sent SyncStep1 to client for ${docName}`);
    });

    // Send awareness states
    const awarenessStates = awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, awarenessProtocol.messageAwareness);
      encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())));
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }

    ws.docName = docName;
  });
}

function broadcastMessage(wss, sender, docName, message) {
  wss.clients.forEach((client) => {
    if (client !== sender && client.docName === docName && client.readyState === 1) {
      client.send(message, (err) => {
        if (err) console.error('Error broadcasting message:', err);
      });
    }
  });
}

export function getOrCreateDoc(docName) {
  if (!docs.has(docName)) {
    docs.set(docName, new Y.Doc());
  }
  return docs.get(docName);
}

export async function getSession(sessionId) {
  // Check if session is already in memory
  let session = sessions.get(sessionId);

  // If not in memory, try to load from database
  if (!session) {
    try {
      const sessionData = await getSessionFromDB(sessionId);

      if (sessionData) {
        console.log(`📂 Auto-registering existing session from database: ${sessionId}`);
        session = {
          id: sessionData.id,
          secretKey: sessionData.secretKey,
          creator: sessionData.creator,
          users: new Map(),
          createdAt: sessionData.createdAt,
          directory: sessionData.directory
        };
        sessions.set(sessionId, session);
      } else {
        // Not in database, check if session directory exists on disk (for backward compatibility)
        const sessionDir = path.join(SESSIONS_BASE_PATH, sessionId);
        try {
          await fs.access(sessionDir);
          console.log(`📂 Found session directory on disk: ${sessionId}`);
          session = {
            id: sessionId,
            secretKey: null,
            creator: null,
            users: new Map(),
            createdAt: Date.now(),
            directory: sessionDir
          };
          sessions.set(sessionId, session);
        } catch (err) {
          // Directory doesn't exist either, session not found
          return null;
        }
      }
    } catch (err) {
      console.error(`❌ Error loading session ${sessionId}:`, err);
      return null;
    }
  }

  return session;
}

export async function createSession(sessionId, secretKey, creator) {
  // Create session directory
  const sessionDir = path.join(SESSIONS_BASE_PATH, sessionId);

  try {
    // Create sessions base directory if it doesn't exist
    await fs.mkdir(SESSIONS_BASE_PATH, { recursive: true });

    // Create session-specific directory
    await fs.mkdir(sessionDir, { recursive: true });
    console.log(`📁 Created session directory: ${sessionDir}`);

    // Save session metadata to PostgreSQL
    await saveSession(sessionId, secretKey, creator, sessionDir);
    console.log(`💾 Saved session ${sessionId} to database`);
  } catch (err) {
    console.error(`Error creating session: ${err.message}`);
    throw err;
  }

  const session = {
    id: sessionId,
    secretKey,
    creator,
    users: new Map(),
    createdAt: Date.now(),
    directory: sessionDir
  };
  sessions.set(sessionId, session);
  return session;
}

export function addUserToSession(sessionId, userId, username) {
  const session = sessions.get(sessionId);
  if (session) {
    session.users.set(userId, {
      id: userId,
      username,
      joinedAt: Date.now()
    });
  }
  return session;
}

export function removeUserFromSession(sessionId, userId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.users.delete(userId);
  }
}

export function getAllSessions() {
  return Array.from(sessions.values());
}

export async function deleteSession(sessionId) {
  try {
    // Get session info to find directory path
    const session = sessions.get(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    const sessionDir = path.join(SESSIONS_BASE_PATH, sessionId);

    // Delete session directory and all its contents
    await fs.rm(sessionDir, { recursive: true, force: true });
    console.log(`🗑️  Deleted session directory: ${sessionDir}`);

    // Delete from database
    await deleteSessionFromDB(sessionId);

    // Remove from in-memory sessions
    sessions.delete(sessionId);

    // Clean up any Yjs documents for this session
    const docsToDelete = [];
    for (const [docName, doc] of docs.entries()) {
      if (docName.startsWith(`${sessionId}/`)) {
        docsToDelete.push(docName);
      }
    }

    for (const docName of docsToDelete) {
      docs.delete(docName);
      docAwareness.delete(docName);
    }

    console.log(`✅ Session ${sessionId} deleted successfully`);
    return true;
  } catch (err) {
    console.error(`❌ Error deleting session ${sessionId}:`, err);
    throw err;
  }
}

