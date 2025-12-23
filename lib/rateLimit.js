// Simple in-memory rate limiter
// For production with multiple instances, consider using Redis
// This implementation is safe for single-instance deployments

const rateLimitMap = new Map();

// Track cleanup interval to prevent memory leaks
let cleanupInterval = null;

/**
 * Rate limiter configuration
 */
const RATE_LIMITS = {
  login: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10 // 10 attempts per 5 minutes
  },
  api: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 100 // 100 requests
  },
  upload: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 10 // 10 uploads
  }
};

// Maximum entries to prevent memory exhaustion
const MAX_ENTRIES = 10000;

/**
 * Check if IP/user is rate limited
 * @param {string} identifier - IP address or user ID
 * @param {string} type - Rate limit type (login, api, upload)
 * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(identifier, type = 'api') {
  const config = RATE_LIMITS[type] || RATE_LIMITS.api;
  const key = `${type}:${identifier}`;
  const now = Date.now();
  
  // Get existing rate limit data
  let rateLimitData = rateLimitMap.get(key);
  
  // Clean up old entries
  if (rateLimitData && now > rateLimitData.resetTime) {
    rateLimitMap.delete(key);
    rateLimitData = null;
  }
  
  // Initialize if doesn't exist
  if (!rateLimitData) {
    rateLimitData = {
      count: 0,
      resetTime: now + config.windowMs
    };
  }
  
  // Increment count
  rateLimitData.count++;

  // Prevent memory exhaustion - clear oldest entries if map is too large
  if (rateLimitMap.size >= MAX_ENTRIES) {
    // Delete oldest 10% of entries
    const entriesToDelete = Math.floor(MAX_ENTRIES * 0.1);
    const keys = Array.from(rateLimitMap.keys()).slice(0, entriesToDelete);
    keys.forEach(k => rateLimitMap.delete(k));
    console.warn(`[RateLimit] Map size exceeded ${MAX_ENTRIES}, cleaned up ${entriesToDelete} entries`);
  }

  // Update map
  rateLimitMap.set(key, rateLimitData);
  
  // Check if rate limit exceeded
  const allowed = rateLimitData.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - rateLimitData.count);
  
  return {
    allowed,
    remaining,
    resetTime: rateLimitData.resetTime,
    retryAfter: allowed ? 0 : Math.ceil((rateLimitData.resetTime - now) / 1000)
  };
}

/**
 * Clean up old rate limit entries (run periodically)
 */
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Initialize cleanup interval (only once)
 * This prevents multiple intervals from being created if module is re-imported
 */
function initCleanupInterval() {
  if (cleanupInterval === null) {
    // Clean up every 5 minutes
    cleanupInterval = setInterval(cleanupRateLimits, 5 * 60 * 1000);
    // Allow process to exit even if interval is active
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }
}

// Initialize on module load
initCleanupInterval();

/**
 * Get client IP from request
 */
export function getClientIP(request) {
  // Try various headers for IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return 'unknown';
}

/**
 * Rate limit middleware for API routes
 */
export function rateLimitMiddleware(request, type = 'api') {
  const ip = getClientIP(request);
  const result = checkRateLimit(ip, type);
  
  return result;
}
