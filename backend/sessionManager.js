import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveSession as saveSessionInDB, deleteSessionFromDB } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory session store for active sessions
const sessions = new Map();

// Get session directory path
function getSessionDirectory(sessionId) {
  return path.join(path.dirname(__dirname), 'sessions', sessionId);
}

/**
 * Create a new session
 */
export async function createSession(sessionId, secretKey, username, creatorUserId = null) {
  const directory = getSessionDirectory(sessionId);

  // Create session directory
  await fs.mkdir(directory, { recursive: true });

  // Create session object
  const session = {
    id: sessionId,
    secretKey,
    directory,
    users: new Map(),
    createdAt: new Date(),
    creatorUserId
  };

  // Store in memory
  sessions.set(sessionId, session);

  // Store in database
  await saveSessionInDB(sessionId, secretKey, username, directory, creatorUserId);

  console.log(`✅ Created session: ${sessionId}`);
  return session;
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId) {
  // Check in-memory first
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }
  
  // If not in memory, check if directory exists and load it
  const directory = getSessionDirectory(sessionId);
  try {
    await fs.access(directory);
    
    // Create session object from directory
    const session = {
      id: sessionId,
      directory,
      users: new Map(),
      createdAt: new Date()
    };
    
    sessions.set(sessionId, session);
    return session;
  } catch (err) {
    return null;
  }
}

/**
 * Add a user to a session
 */
export function addUserToSession(sessionId, userId, username) {
  const session = sessions.get(sessionId);
  if (session) {
    session.users.set(userId, { username, joinedAt: new Date() });
    console.log(`👤 User ${username} joined session ${sessionId}`);
  }
}

/**
 * Get all sessions
 */
export function getAllSessions() {
  return Array.from(sessions.values());
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId) {
  const directory = getSessionDirectory(sessionId);

  // Delete directory and all contents
  try {
    await fs.rm(directory, { recursive: true, force: true });
    console.log(`🗑️  Deleted session directory: ${sessionId}`);
  } catch (err) {
    console.error(`Error deleting session directory ${sessionId}:`, err);
  }

  // Delete from database
  try {
    await deleteSessionFromDB(sessionId);
  } catch (err) {
    console.error(`Error deleting session from database ${sessionId}:`, err);
  }

  // Remove from memory
  sessions.delete(sessionId);

  console.log(`✅ Deleted session: ${sessionId}`);
}

