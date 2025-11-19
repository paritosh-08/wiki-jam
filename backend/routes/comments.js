import express from 'express';
import { nanoid } from 'nanoid';
import {
  createComment,
  getCommentsByPage,
  updateComment,
  resolveComment,
  deleteComment,
  createMention,
  getUserByEmail,
  getUserById
} from '../db.js';
import { verifyFirebaseToken } from '../auth.js';
import { sendMentionNotification } from '../notifications.js';

export const commentsRouter = express.Router();

// All comment routes require authentication
commentsRouter.use(verifyFirebaseToken);

/**
 * Get all comments for a specific page
 * GET /api/comments/:sessionId/:pageFilename
 */
commentsRouter.get('/:sessionId/:pageFilename', async (req, res) => {
  try {
    const { sessionId, pageFilename } = req.params;
    const comments = await getCommentsByPage(sessionId, pageFilename);
    res.json({ comments });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

/**
 * Create a new comment
 * POST /api/comments
 * Body: { sessionId, pageFilename, content, positionStart, positionEnd, parentCommentId?, mentions?, assigned? }
 */
commentsRouter.post('/', async (req, res) => {
  try {
    const { sessionId, pageFilename, content, positionStart, positionEnd, parentCommentId, mentions, assigned } = req.body;

    if (!sessionId || !pageFilename || !content || positionStart === undefined || positionEnd === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const commentId = nanoid(16);
    const userId = req.user.uid;

    // Create the comment
    const comment = await createComment(
      commentId,
      sessionId,
      pageFilename,
      userId,
      content,
      positionStart,
      positionEnd,
      parentCommentId || null,
      assigned || false
    );

    // Process mentions if any
    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      for (const mentionedEmail of mentions) {
        try {
          const mentionedUser = await getUserByEmail(mentionedEmail);
          if (mentionedUser) {
            const mentionId = nanoid(16);
            await createMention(mentionId, commentId, mentionedUser.id);

            // Only send email notification if comment is assigned
            if (assigned) {
              try {
                const commenter = await getUserById(userId);
                await sendMentionNotification({
                  id: mentionId,
                  commentId,
                  mentionedUserId: mentionedUser.id,
                  mentionedEmail: mentionedUser.email,
                  mentionedName: mentionedUser.displayName || mentionedUser.email,
                  commenterEmail: commenter.email,
                  commenterName: commenter.displayName || commenter.email,
                  commentContent: content,
                  sessionId,
                  pageFilename
                });
                console.log(`📧 Sent assignment email to ${mentionedEmail}`);
              } catch (emailErr) {
                console.error(`Failed to send email notification for ${mentionedEmail}:`, emailErr);
                // Don't fail the request if email fails
              }
            }
          }
        } catch (err) {
          console.error(`Error creating mention for ${mentionedEmail}:`, err);
        }
      }
    }

    res.json({
      comment: {
        ...comment,
        userEmail: req.user.email,
        userDisplayName: req.user.displayName
      }
    });
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

/**
 * Update a comment
 * PUT /api/comments/:commentId
 * Body: { content }
 */
commentsRouter.put('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    await updateComment(commentId, content);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating comment:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

/**
 * Resolve/unresolve a comment
 * PATCH /api/comments/:commentId/resolve
 * Body: { resolved }
 */
commentsRouter.patch('/:commentId/resolve', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { resolved } = req.body;
    
    if (resolved === undefined) {
      return res.status(400).json({ error: 'Resolved status is required' });
    }
    
    await resolveComment(commentId, resolved);
    res.json({ success: true });
  } catch (err) {
    console.error('Error resolving comment:', err);
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
});

/**
 * Delete a comment
 * DELETE /api/comments/:commentId
 */
commentsRouter.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    await deleteComment(commentId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

