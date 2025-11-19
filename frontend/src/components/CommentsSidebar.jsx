import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authenticatedFetch } from '../utils/api';
import './CommentsSidebar.css';

function CommentsSidebar({ sessionId, pageFilename }) {
  const { token, user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sessionUsers, setSessionUsers] = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [isAssigned, setIsAssigned] = useState(false);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  // Fetch session users for mentions
  useEffect(() => {
    const fetchSessionUsers = async () => {
      if (!sessionId || !token) return;

      try {
        const data = await authenticatedFetch(
          `/api/session/${sessionId}/users`,
          {},
          token
        );
        setSessionUsers(data.users || []);
      } catch (err) {
        console.error('Failed to fetch session users:', err);
      }
    };

    fetchSessionUsers();
  }, [sessionId, token]);

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      if (!sessionId || !pageFilename || !token) return;

      try {
        setLoading(true);
        const data = await authenticatedFetch(
          `/api/comments/${sessionId}/${pageFilename}`,
          {},
          token
        );
        setComments(data.comments || []);
      } catch (err) {
        setError('Failed to load comments');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [sessionId, pageFilename, token]);

  // Fuzzy search for users
  const fuzzySearchUsers = (query) => {
    if (!query) return sessionUsers.slice(0, 5);

    const lowerQuery = query.toLowerCase();

    const scoredUsers = sessionUsers.map(user => {
      const displayName = (user.displayName || '').toLowerCase();
      const email = user.email.toLowerCase();
      let score = 0;

      // Exact match
      if (displayName === lowerQuery || email === lowerQuery) {
        score = 1000;
      }
      // Starts with query
      else if (displayName.startsWith(lowerQuery) || email.startsWith(lowerQuery)) {
        score = 500;
      }
      // Contains query
      else if (displayName.includes(lowerQuery) || email.includes(lowerQuery)) {
        score = 100;
      }
      // Fuzzy match
      else {
        let queryIndex = 0;
        for (let i = 0; i < displayName.length && queryIndex < lowerQuery.length; i++) {
          if (displayName[i] === lowerQuery[queryIndex]) queryIndex++;
        }
        if (queryIndex === lowerQuery.length) score = 50;

        queryIndex = 0;
        for (let i = 0; i < email.length && queryIndex < lowerQuery.length; i++) {
          if (email[i] === lowerQuery[queryIndex]) queryIndex++;
        }
        if (queryIndex === lowerQuery.length) score = Math.max(score, 50);
      }

      return { user, score };
    });

    return scoredUsers
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.user)
      .slice(0, 5);
  };

  // Handle textarea input for mention detection
  const handleTextareaChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    setNewComment(value);

    // Find @ symbol before cursor
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        atIndex = i;
        break;
      }
      if (value[i] === ' ' || value[i] === '\n') {
        break;
      }
    }

    if (atIndex !== -1) {
      const query = value.substring(atIndex + 1, cursorPos);
      const filtered = fuzzySearchUsers(query);

      if (filtered.length > 0) {
        setMentionStartIndex(atIndex);
        setFilteredUsers(filtered);
        setShowMentionDropdown(true);
        setSelectedMentionIndex(0);
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  // Handle mention selection
  const selectMention = (userEmail) => {
    const beforeMention = newComment.substring(0, mentionStartIndex);
    const afterMention = newComment.substring(textareaRef.current.selectionStart);
    const newValue = beforeMention + '@' + userEmail + ' ' + afterMention;

    setNewComment(newValue);
    setShowMentionDropdown(false);

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current.focus();
      const newCursorPos = beforeMention.length + userEmail.length + 2;
      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Handle keyboard navigation in mention dropdown
  const handleTextareaKeyDown = (e) => {
    if (!showMentionDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedMentionIndex(prev =>
        prev < filteredUsers.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0);
    } else if (e.key === 'Enter' && filteredUsers.length > 0) {
      e.preventDefault();
      selectMention(filteredUsers[selectedMentionIndex].email);
    } else if (e.key === 'Escape') {
      setShowMentionDropdown(false);
    }
  };

  // Extract mentions from comment text
  const extractMentions = (text) => {
    const mentionRegex = /@([^\s@]+@[^\s@]+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  };

  // Add new comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const mentions = extractMentions(newComment);

      const data = await authenticatedFetch(
        '/api/comments',
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId,
            pageFilename,
            content: newComment,
            parentCommentId: replyTo,
            positionStart: 0,
            positionEnd: 0,
            mentions,
            assigned: isAssigned
          })
        },
        token
      );

      setComments([...comments, data.comment]);
      setNewComment('');
      setReplyTo(null);
      setIsAssigned(false);
    } catch (err) {
      setError('Failed to add comment');
      console.error(err);
    }
  };

  // Resolve/unresolve comment
  const handleToggleResolve = async (commentId, currentStatus) => {
    try {
      const data = await authenticatedFetch(
        `/api/comments/${commentId}/resolve`,
        {
          method: 'PATCH',
          body: JSON.stringify({ resolved: !currentStatus })
        },
        token
      );

      setComments(comments.map(c => 
        c.id === commentId ? { ...c, resolved: !currentStatus } : c
      ));
    } catch (err) {
      setError('Failed to update comment');
      console.error(err);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      await authenticatedFetch(
        `/api/comments/${commentId}`,
        { method: 'DELETE' },
        token
      );

      setComments(comments.filter(c => c.id !== commentId));
    } catch (err) {
      setError('Failed to delete comment');
      console.error(err);
    }
  };

  // Organize comments into threads
  const organizeThreads = () => {
    const threads = [];
    const commentMap = {};

    // Create a map of all comments
    comments.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    // Organize into threads
    comments.forEach(comment => {
      if (comment.parentCommentId) {
        const parent = commentMap[comment.parentCommentId];
        if (parent) {
          parent.replies.push(commentMap[comment.id]);
        }
      } else {
        threads.push(commentMap[comment.id]);
      }
    });

    return threads;
  };

  const renderComment = (comment, isReply = false) => (
    <div key={comment.id} className={`comment ${isReply ? 'comment-reply' : ''} ${comment.resolved ? 'comment-resolved' : ''}`}>
      <div className="comment-header">
        <div className="comment-author">
          <div className="comment-avatar">
            {(comment.userDisplayName || comment.userEmail || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="comment-author-name">{comment.userDisplayName || comment.userEmail || 'Unknown'}</div>
            <div className="comment-date">{new Date(comment.createdAt).toLocaleString()}</div>
          </div>
        </div>
        {comment.userId === user?.uid && (
          <button
            onClick={() => handleDeleteComment(comment.id)}
            className="comment-delete"
            title="Delete comment"
          >
            ×
          </button>
        )}
      </div>
      
      <div className="comment-content">{comment.content}</div>
      
      <div className="comment-actions">
        <button onClick={() => setReplyTo(comment.id)} className="comment-action-btn">
          Reply
        </button>
        <button 
          onClick={() => handleToggleResolve(comment.id, comment.resolved)}
          className="comment-action-btn"
        >
          {comment.resolved ? 'Unresolve' : 'Resolve'}
        </button>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map(reply => renderComment(reply, true))}
        </div>
      )}
    </div>
  );

  const threads = organizeThreads();

  return (
    <div className="comments-sidebar">
      <div className="comments-header">
        <h3>Comments</h3>
        <span className="comments-count">{comments.length}</span>
      </div>

      {error && <div className="comments-error">{error}</div>}

      <div className="comments-list">
        {loading ? (
          <div className="comments-loading">Loading comments...</div>
        ) : threads.length === 0 ? (
          <div className="comments-empty">No comments yet</div>
        ) : (
          threads.map(thread => renderComment(thread))
        )}
      </div>

      <form onSubmit={handleAddComment} className="comment-form">
        {replyTo && (
          <div className="reply-indicator">
            Replying to comment
            <button type="button" onClick={() => setReplyTo(null)}>Cancel</button>
          </div>
        )}
        <div className="comment-input-wrapper">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Add a comment... (use @ to mention)"
            className="comment-input"
            rows={3}
          />
          {showMentionDropdown && (
            <div ref={dropdownRef} className="mention-dropdown">
              {filteredUsers.map((user, index) => (
                <div
                  key={user.email}
                  className={`mention-item ${index === selectedMentionIndex ? 'selected' : ''}`}
                  onClick={() => selectMention(user.email)}
                  onMouseEnter={() => setSelectedMentionIndex(index)}
                >
                  <div className="mention-user-avatar">
                    {(user.displayName || user.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="mention-user-info">
                    <div className="mention-user-name">{user.displayName || user.email}</div>
                    <div className="mention-user-email">{user.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {extractMentions(newComment).length > 0 && (
          <div className="comment-assign-wrapper">
            <label className="comment-assign-label">
              <input
                type="checkbox"
                checked={isAssigned}
                onChange={(e) => setIsAssigned(e.target.checked)}
                className="comment-assign-checkbox"
              />
              <span>Assign to mentioned users (send email notification)</span>
            </label>
          </div>
        )}
        <button type="submit" className="comment-submit" disabled={!newComment.trim()}>
          {replyTo ? 'Reply' : 'Comment'}
        </button>
      </form>
    </div>
  );
}

export default CommentsSidebar;

