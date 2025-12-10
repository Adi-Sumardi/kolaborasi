// Simple in-memory rate limiter
// For production, consider using Redis

const rateLimitMap = new Map();

/**
 * Rate limiter configuration
 */
const RATE_LIMITS = {
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5 // 5 attempts
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

// Clean up every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

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
