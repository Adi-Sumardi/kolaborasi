import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGO_URL;

/**
 * MongoDB connection options optimized for production
 * - Connection pooling for better performance
 * - Retry logic for resilience
 * - Timeouts to prevent hanging connections
 */
const options = {
  // Connection pool settings
  maxPoolSize: 10, // Maximum number of connections in the pool
  minPoolSize: 2,  // Minimum connections to maintain
  maxIdleTimeMS: 60000, // Close idle connections after 60 seconds

  // Timeouts
  connectTimeoutMS: 10000, // 10 seconds to establish connection
  socketTimeoutMS: 45000,  // 45 seconds for socket operations
  serverSelectionTimeoutMS: 10000, // 10 seconds to select server

  // Retry settings
  retryWrites: true,
  retryReads: true,

  // Use stable API version (for MongoDB Atlas)
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false, // Allow commands not in Stable API
    deprecationErrors: true,
  },

  // Compression for better network performance
  compressors: ['zlib'],
};

let client;
let clientPromise;

if (!process.env.MONGO_URL) {
  throw new Error('Please add your Mongo URI to .env');
}

/**
 * Create MongoDB client with connection handling
 */
function createClient() {
  const mongoClient = new MongoClient(uri, options);

  // Handle connection events
  mongoClient.on('connectionPoolCreated', () => {
    console.log('[MongoDB] Connection pool created');
  });

  mongoClient.on('connectionPoolClosed', () => {
    console.log('[MongoDB] Connection pool closed');
  });

  mongoClient.on('error', (error) => {
    console.error('[MongoDB] Connection error:', error);
  });

  return mongoClient;
}

if (process.env.NODE_ENV === 'development') {
  // In development, use a global variable to preserve connection across hot reloads
  if (!global._mongoClientPromise) {
    client = createClient();
    global._mongoClientPromise = client.connect()
      .then((connectedClient) => {
        console.log('[MongoDB] Connected successfully (development)');
        return connectedClient;
      })
      .catch((error) => {
        console.error('[MongoDB] Failed to connect:', error);
        throw error;
      });
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production, create a new client for each deployment
  client = createClient();
  clientPromise = client.connect()
    .then((connectedClient) => {
      console.log('[MongoDB] Connected successfully (production)');
      return connectedClient;
    })
    .catch((error) => {
      console.error('[MongoDB] Failed to connect:', error);
      // In production, exit process on connection failure
      process.exit(1);
    });
}

/**
 * Get database instance
 * @param {string} dbName - Optional database name, defaults to connection string database
 */
export async function getDatabase(dbName) {
  const client = await clientPromise;
  return client.db(dbName);
}

/**
 * Health check for MongoDB connection
 */
export async function checkConnection() {
  try {
    const client = await clientPromise;
    await client.db().admin().ping();
    return { status: 'healthy', message: 'MongoDB connection is active' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

export default clientPromise;