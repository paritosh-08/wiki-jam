import express from 'express';
import { pool } from '../db.js';
import { verifyFirebaseToken } from '../auth.js';

export const usersRouter = express.Router();

// All user routes require authentication
usersRouter.use(verifyFirebaseToken);

/**
 * Get all users in a session (for mention autocomplete)
 * GET /api/users/session/:sessionId
 */
usersRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get all users who have created comments in this session
    // Plus the session creator
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT DISTINCT u.id, u.email, u.display_name
         FROM users u
         WHERE u.id IN (
           SELECT DISTINCT user_id FROM comments WHERE session_id = $1
           UNION
           SELECT creator_user_id FROM sessions WHERE id = $1 AND creator_user_id IS NOT NULL
         )
         ORDER BY u.display_name`,
        [sessionId]
      );
      
      const users = result.rows.map(row => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name
      }));
      
      res.json({ users });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching session users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * Get current user info
 * GET /api/users/me
 */
usersRouter.get('/me', async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.uid,
        email: req.user.email,
        displayName: req.user.displayName
      }
    });
  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

