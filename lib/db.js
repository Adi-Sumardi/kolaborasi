import { Pool } from 'pg';

/**
 * PostgreSQL connection pool
 * Optimized for production with connection pooling
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  min: 2,  // Minimum number of clients
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not available
  // SSL for production (required for most cloud providers)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Log pool events
pool.on('connect', () => {
  console.log('[PostgreSQL] Client connected to pool');
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err);
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('[PostgreSQL] Query executed', { text: text.substring(0, 50), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('[PostgreSQL] Query error:', error.message);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<PoolClient>}
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Execute a transaction
 * @param {Function} callback - Function that receives the client
 * @returns {Promise<any>}
 */
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check for PostgreSQL connection
 */
export async function checkConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    return {
      status: 'healthy',
      message: 'PostgreSQL connection is active',
      timestamp: result.rows[0].now
    };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

/**
 * Close all connections (for graceful shutdown)
 */
export async function closePool() {
  await pool.end();
  console.log('[PostgreSQL] Pool has ended');
}

export default pool;
