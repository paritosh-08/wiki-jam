import express from 'express';
import { nanoid } from 'nanoid';
import {
  createSession,
  getSession,
  addUserToSession,
  getAllSessions,
  deleteSession
} from '../yjsServer.js';
import { getSessionBySecretKey } from '../db.js';

export const sessionRouter = express.Router();

// Create a new session
sessionRouter.post('/create', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const sessionId = nanoid(10);
  const secretKey = nanoid(16);
  const userId = nanoid(8);

  try {
    const session = await createSession(sessionId, secretKey, username);
    addUserToSession(sessionId, userId, username);

    res.json({
      sessionId,
      secretKey,
      userId,
      username
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create session: ' + err.message });
  }
});

// Join an existing session
sessionRouter.post('/join', async (req, res) => {
  const { secretKey, username } = req.body;

  if (!secretKey || !username) {
    return res.status(400).json({ error: 'Secret key and username are required' });
  }

  try {
    // First check in-memory sessions (unhashed secret key comparison)
    const sessions = getAllSessions();
    let session = sessions.find(s => s.secretKey === secretKey);

    // If not found in memory, check database (hashed secret key comparison)
    if (!session) {
      const sessionData = await getSessionBySecretKey(secretKey);
      if (sessionData) {
        // Load session into memory
        session = await getSession(sessionData.id);
        // Store the original (unhashed) secret key in the in-memory session
        // so future joins can use fast in-memory lookup
        if (session) {
          session.secretKey = secretKey;
        }
      }
    }

    if (!session) {
      return res.status(404).json({ error: 'Invalid secret key' });
    }

    const userId = nanoid(8);
    addUserToSession(session.id, userId, username);

    res.json({
      sessionId: session.id,
      secretKey: secretKey, // Return the original (unhashed) secret key to the client
      userId,
      username
    });
  } catch (err) {
    console.error('Error joining session:', err);
    res.status(500).json({ error: 'Failed to join session: ' + err.message });
  }
});

// Get session info
sessionRouter.get('/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    id: session.id,
    creator: session.creator,
    users: Array.from(session.users.values()),
    createdAt: session.createdAt
  });
});

// Delete session
sessionRouter.delete('/delete', async (req, res) => {
  const { secretKey } = req.body;

  if (!secretKey) {
    return res.status(400).json({ error: 'Secret key is required' });
  }

  try {
    // First check in-memory sessions (unhashed secret key comparison)
    const sessions = getAllSessions();
    let session = sessions.find(s => s.secretKey === secretKey);

    // If not found in memory, check database (hashed secret key comparison)
    if (!session) {
      const sessionData = await getSessionBySecretKey(secretKey);
      if (sessionData) {
        session = { id: sessionData.id };
      }
    }

    if (!session) {
      return res.status(404).json({ error: 'Invalid secret key' });
    }

    // Delete the session
    await deleteSession(session.id);

    res.json({
      success: true,
      message: 'Session deleted successfully',
      sessionId: session.id
    });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: 'Failed to delete session: ' + err.message });
  }
});

