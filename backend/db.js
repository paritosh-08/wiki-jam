import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

const SALT_ROUNDS = 10;

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'wiki_jam',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Initialize database schema
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔧 Initializing database schema...');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255),
        created_at BIGINT NOT NULL
      )
    `);
    console.log('✅ Users table ready');

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        secret_key VARCHAR(255) NOT NULL,
        creator VARCHAR(255),
        creator_user_id VARCHAR(255),
        created_at BIGINT NOT NULL,
        directory VARCHAR(500) NOT NULL,
        FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Sessions table ready');

    // Create comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(255) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        page_filename VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        position_start INTEGER NOT NULL,
        position_end INTEGER NOT NULL,
        parent_comment_id VARCHAR(255),
        resolved BOOLEAN DEFAULT FALSE,
        assigned BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Comments table ready');

    // Create mentions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS mentions (
        id VARCHAR(255) PRIMARY KEY,
        comment_id VARCHAR(255) NOT NULL,
        mentioned_user_id VARCHAR(255) NOT NULL,
        notified BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Mentions table ready');

    // Create session_members table to track which users have joined which sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_members (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        joined_at BIGINT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(session_id, user_id)
      )
    `);
    console.log('✅ Session members table ready');

    // Create wiki_page_tags table to store tags for wiki pages
    await client.query(`
      CREATE TABLE IF NOT EXISTS wiki_page_tags (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        tag VARCHAR(100) NOT NULL,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, filename, tag)
      )
    `);
    console.log('✅ Wiki page tags table ready');

    // ShareDB will create its own tables automatically
    console.log('✅ Database schema initialized');

  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Session management functions
export async function saveSession(sessionId, secretKey, creator, directory, creatorUserId = null) {
  const client = await pool.connect();

  try {
    // Hash the secret key before storing
    const hashedSecretKey = await bcrypt.hash(secretKey, SALT_ROUNDS);

    await client.query(
      `INSERT INTO sessions (id, secret_key, creator, creator_user_id, created_at, directory)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET secret_key = $2, creator = $3, creator_user_id = $4, directory = $6`,
      [sessionId, hashedSecretKey, creator, creatorUserId, Date.now(), directory]
    );
    console.log(`💾 Saved session ${sessionId} to database (secret key hashed)`);
  } catch (err) {
    console.error(`❌ Error saving session ${sessionId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getSessionFromDB(sessionId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT * FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      secretKey: row.secret_key,
      creator: row.creator,
      creatorUserId: row.creator_user_id,
      createdAt: row.created_at,
      directory: row.directory
    };
  } catch (err) {
    console.error(`❌ Error getting session ${sessionId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function addSessionMember(sessionId, userId) {
  const client = await pool.connect();

  try {
    await client.query(
      `INSERT INTO session_members (session_id, user_id, joined_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [sessionId, userId, Date.now()]
    );
  } catch (err) {
    console.error(`❌ Error adding session member:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserSessions(userId) {
  const client = await pool.connect();

  try {
    // Get all sessions the user has created or joined
    const result = await client.query(
      `SELECT DISTINCT s.id, s.creator, s.creator_user_id, s.created_at, s.directory,
              CASE WHEN s.creator_user_id = $1 THEN true ELSE false END as is_creator
       FROM sessions s
       LEFT JOIN session_members sm ON s.id = sm.session_id
       WHERE s.creator_user_id = $1 OR sm.user_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      creator: row.creator,
      creatorUserId: row.creator_user_id,
      createdAt: row.created_at,
      directory: row.directory,
      isCreator: row.is_creator
    }));
  } catch (err) {
    console.error(`❌ Error getting sessions for user ${userId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getSessionUsers(sessionId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT DISTINCT u.id, u.email, u.display_name
       FROM users u
       INNER JOIN session_members sm ON u.id = sm.user_id
       WHERE sm.session_id = $1
       ORDER BY u.display_name, u.email`,
      [sessionId]
    );

    return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name
    }));
  } catch (err) {
    console.error(`❌ Error getting users for session ${sessionId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getSessionBySecretKey(secretKey) {
  const client = await pool.connect();

  try {
    // Get all sessions and compare hashed secret keys
    const result = await client.query('SELECT * FROM sessions');

    if (result.rows.length === 0) {
      return null;
    }

    // Find the session with matching secret key by comparing hashes
    for (const row of result.rows) {
      const isMatch = await bcrypt.compare(secretKey, row.secret_key);
      if (isMatch) {
        return {
          id: row.id,
          secretKey: row.secret_key, // Return the hashed version
          creator: row.creator,
          createdAt: row.created_at,
          directory: row.directory
        };
      }
    }

    return null;
  } catch (err) {
    console.error(`❌ Error getting session by secret key:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getAllSessionsFromDB() {
  const client = await pool.connect();

  try {
    const result = await client.query('SELECT * FROM sessions');
    return result.rows.map(row => ({
      id: row.id,
      secretKey: row.secret_key,
      creator: row.creator,
      createdAt: row.created_at,
      directory: row.directory
    }));
  } catch (err) {
    console.error('❌ Error getting all sessions:', err);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSessionFromDB(sessionId) {
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    console.log(`🗑️  Deleted session ${sessionId} from database`);
  } catch (err) {
    console.error(`❌ Error deleting session ${sessionId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

// User management functions
export async function createUser(userId, email, displayName) {
  const client = await pool.connect();

  try {
    await client.query(
      `INSERT INTO users (id, email, display_name, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET email = $2, display_name = $3`,
      [userId, email, displayName, Date.now()]
    );
    console.log(`👤 Created/updated user ${userId}`);
  } catch (err) {
    console.error(`❌ Error creating user ${userId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserById(userId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at
    };
  } catch (err) {
    console.error(`❌ Error getting user ${userId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserByEmail(email) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at
    };
  } catch (err) {
    console.error(`❌ Error getting user by email ${email}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

// Comment management functions
export async function createComment(commentId, sessionId, pageFilename, userId, content, positionStart, positionEnd, parentCommentId = null, assigned = false) {
  const client = await pool.connect();

  try {
    const now = Date.now();
    await client.query(
      `INSERT INTO comments (id, session_id, page_filename, user_id, content, position_start, position_end, parent_comment_id, resolved, assigned, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [commentId, sessionId, pageFilename, userId, content, positionStart, positionEnd, parentCommentId, false, assigned, now, now]
    );
    console.log(`💬 Created comment ${commentId}${assigned ? ' (assigned)' : ''}`);

    return {
      id: commentId,
      sessionId,
      pageFilename,
      userId,
      content,
      positionStart,
      positionEnd,
      parentCommentId,
      resolved: false,
      assigned,
      createdAt: now,
      updatedAt: now
    };
  } catch (err) {
    console.error(`❌ Error creating comment:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getCommentsByPage(sessionId, pageFilename) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT c.*, u.email, u.display_name
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.session_id = $1 AND c.page_filename = $2
       ORDER BY c.created_at ASC`,
      [sessionId, pageFilename]
    );

    return result.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      pageFilename: row.page_filename,
      userId: row.user_id,
      userEmail: row.email,
      userDisplayName: row.display_name,
      content: row.content,
      positionStart: row.position_start,
      positionEnd: row.position_end,
      parentCommentId: row.parent_comment_id,
      resolved: row.resolved,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) {
    console.error(`❌ Error getting comments:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function updateComment(commentId, content) {
  const client = await pool.connect();

  try {
    await client.query(
      `UPDATE comments SET content = $1, updated_at = $2 WHERE id = $3`,
      [content, Date.now(), commentId]
    );
    console.log(`💬 Updated comment ${commentId}`);
  } catch (err) {
    console.error(`❌ Error updating comment:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function resolveComment(commentId, resolved) {
  const client = await pool.connect();

  try {
    await client.query(
      `UPDATE comments SET resolved = $1, updated_at = $2 WHERE id = $3`,
      [resolved, Date.now(), commentId]
    );
    console.log(`💬 ${resolved ? 'Resolved' : 'Unresolved'} comment ${commentId}`);
  } catch (err) {
    console.error(`❌ Error resolving comment:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteComment(commentId) {
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM comments WHERE id = $1', [commentId]);
    console.log(`🗑️  Deleted comment ${commentId}`);
  } catch (err) {
    console.error(`❌ Error deleting comment:`, err);
    throw err;
  } finally {
    client.release();
  }
}

// Mention management functions
export async function createMention(mentionId, commentId, mentionedUserId) {
  const client = await pool.connect();

  try {
    await client.query(
      `INSERT INTO mentions (id, comment_id, mentioned_user_id, notified, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [mentionId, commentId, mentionedUserId, false, Date.now()]
    );
    console.log(`📢 Created mention ${mentionId}`);
  } catch (err) {
    console.error(`❌ Error creating mention:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function markMentionNotified(mentionId) {
  const client = await pool.connect();

  try {
    await client.query(
      `UPDATE mentions SET notified = true WHERE id = $1`,
      [mentionId]
    );
  } catch (err) {
    console.error(`❌ Error marking mention notified:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getUnnotifiedMentions() {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT m.*, c.content, c.session_id, c.page_filename,
              u1.email as mentioned_email, u1.display_name as mentioned_name,
              u2.email as commenter_email, u2.display_name as commenter_name
       FROM mentions m
       JOIN comments c ON m.comment_id = c.id
       JOIN users u1 ON m.mentioned_user_id = u1.id
       JOIN users u2 ON c.user_id = u2.id
       WHERE m.notified = false`
    );

    return result.rows.map(row => ({
      id: row.id,
      commentId: row.comment_id,
      mentionedUserId: row.mentioned_user_id,
      mentionedEmail: row.mentioned_email,
      mentionedName: row.mentioned_name,
      commenterEmail: row.commenter_email,
      commenterName: row.commenter_name,
      commentContent: row.content,
      sessionId: row.session_id,
      pageFilename: row.page_filename,
      createdAt: row.created_at
    }));
  } catch (err) {
    console.error(`❌ Error getting unnotified mentions:`, err);
    throw err;
  } finally {
    client.release();
  }
}

// Wiki page tag management functions
export async function addPageTag(sessionId, filename, tag) {
  const client = await pool.connect();

  try {
    await client.query(
      `INSERT INTO wiki_page_tags (session_id, filename, tag, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, filename, tag) DO NOTHING`,
      [sessionId, filename, tag.trim(), Date.now()]
    );
    console.log(`🏷️  Added tag "${tag}" to ${filename}`);
  } catch (err) {
    console.error(`❌ Error adding tag:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function removePageTag(sessionId, filename, tag) {
  const client = await pool.connect();

  try {
    await client.query(
      `DELETE FROM wiki_page_tags
       WHERE session_id = $1 AND filename = $2 AND tag = $3`,
      [sessionId, filename, tag.trim()]
    );
    console.log(`🏷️  Removed tag "${tag}" from ${filename}`);
  } catch (err) {
    console.error(`❌ Error removing tag:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getPageTags(sessionId, filename) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT tag FROM wiki_page_tags
       WHERE session_id = $1 AND filename = $2
       ORDER BY tag ASC`,
      [sessionId, filename]
    );

    return result.rows.map(row => row.tag);
  } catch (err) {
    console.error(`❌ Error getting tags for ${filename}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getAllTagsForSession(sessionId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT DISTINCT tag FROM wiki_page_tags
       WHERE session_id = $1
       ORDER BY tag ASC`,
      [sessionId]
    );

    return result.rows.map(row => row.tag);
  } catch (err) {
    console.error(`❌ Error getting all tags for session:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getPagesByTags(sessionId, tags) {
  const client = await pool.connect();

  try {
    // Get filenames that have ALL the specified tags
    const placeholders = tags.map((_, i) => `$${i + 2}`).join(', ');
    const result = await client.query(
      `SELECT filename
       FROM wiki_page_tags
       WHERE session_id = $1 AND tag IN (${placeholders})
       GROUP BY filename
       HAVING COUNT(DISTINCT tag) = $${tags.length + 2}`,
      [sessionId, ...tags, tags.length]
    );

    return result.rows.map(row => row.filename);
  } catch (err) {
    console.error(`❌ Error getting pages by tags:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function setPageTags(sessionId, filename, tags) {
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // Remove all existing tags for this page
    await client.query(
      `DELETE FROM wiki_page_tags WHERE session_id = $1 AND filename = $2`,
      [sessionId, filename]
    );

    // Add new tags
    if (tags && tags.length > 0) {
      const values = tags.map((tag, i) =>
        `($1, $2, $${i + 3}, $${tags.length + 3})`
      ).join(', ');

      await client.query(
        `INSERT INTO wiki_page_tags (session_id, filename, tag, created_at)
         VALUES ${values}
         ON CONFLICT (session_id, filename, tag) DO NOTHING`,
        [sessionId, filename, ...tags.map(t => t.trim()), Date.now()]
      );
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log(`🏷️  Set tags for ${filename}: ${tags.join(', ')}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Error setting tags:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export { pool };

