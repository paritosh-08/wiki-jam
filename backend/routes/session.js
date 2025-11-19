import express from 'express';
import { nanoid } from 'nanoid';
import {
  createSession,
  getSession,
  addUserToSession,
  getAllSessions,
  deleteSession
} from '../sessionManager.js';
import { getSessionBySecretKey, getUserSessions, addSessionMember, getSessionFromDB, getSessionUsers } from '../db.js';
import { optionalAuth, verifyFirebaseToken } from '../auth.js';

export const sessionRouter = express.Router();

// Get user's sessions
sessionRouter.get('/my-sessions', verifyFirebaseToken, async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.uid);
    res.json({ sessions });
  } catch (err) {
    console.error('Error fetching user sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get all users in a session
sessionRouter.get('/:sessionId/users', verifyFirebaseToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const users = await getSessionUsers(sessionId);
    res.json({ users });
  } catch (err) {
    console.error('Error fetching session users:', err);
    res.status(500).json({ error: 'Failed to fetch session users' });
  }
});

// Create a new session
sessionRouter.post('/create', optionalAuth, async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const sessionId = nanoid(10);
  const secretKey = nanoid(16);
  const userId = req.user?.uid || nanoid(8); // Use Firebase UID if authenticated

  try {
    const session = await createSession(sessionId, secretKey, username, req.user?.uid);
    addUserToSession(sessionId, userId, username);

    // Track session membership for authenticated users
    if (req.user?.uid) {
      try {
        await addSessionMember(sessionId, req.user.uid);
      } catch (err) {
        console.error('Error tracking session membership:', err);
        // Don't fail the creation if tracking fails
      }
    }

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
sessionRouter.post('/join', optionalAuth, async (req, res) => {
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

    const userId = req.user?.uid || nanoid(8); // Use Firebase UID if authenticated
    addUserToSession(session.id, userId, username);

    // Track session membership for authenticated users
    if (req.user?.uid) {
      try {
        await addSessionMember(session.id, req.user.uid);
      } catch (err) {
        console.error('Error tracking session membership:', err);
        // Don't fail the join if tracking fails
      }
    }

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
sessionRouter.get('/:sessionId', async (req, res) => {
  const session = await getSession(req.params.sessionId);

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
sessionRouter.delete('/delete', optionalAuth, async (req, res) => {
  const { secretKey, sessionId } = req.body;

  try {
    let session = null;

    // If authenticated and sessionId provided, check if user is the creator
    if (req.user?.uid && sessionId) {
      const sessionData = await getSessionFromDB(sessionId);
      if (sessionData && sessionData.creatorUserId === req.user.uid) {
        session = { id: sessionId };
      } else if (!sessionData) {
        return res.status(404).json({ error: 'Session not found' });
      } else {
        return res.status(403).json({ error: 'You can only delete sessions you created' });
      }
    }
    // Otherwise, require secret key
    else if (secretKey) {
      // First check in-memory sessions (unhashed secret key comparison)
      const sessions = getAllSessions();
      session = sessions.find(s => s.secretKey === secretKey);

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
    } else {
      return res.status(400).json({ error: 'Either sessionId (for creators) or secretKey is required' });
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

