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
    
    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        secret_key VARCHAR(255) NOT NULL,
        creator VARCHAR(255),
        created_at BIGINT NOT NULL,
        directory VARCHAR(500) NOT NULL
      )
    `);
    
    console.log('✅ Sessions table ready');
    
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
export async function saveSession(sessionId, secretKey, creator, directory) {
  const client = await pool.connect();

  try {
    // Hash the secret key before storing
    const hashedSecretKey = await bcrypt.hash(secretKey, SALT_ROUNDS);

    await client.query(
      `INSERT INTO sessions (id, secret_key, creator, created_at, directory)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET secret_key = $2, creator = $3, directory = $5`,
      [sessionId, hashedSecretKey, creator, Date.now(), directory]
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

export { pool };

