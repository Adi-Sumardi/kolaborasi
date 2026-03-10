/**
 * Unit tests for lib/rateLimit.js
 * Tests rate limiter creation, enforcement, window reset, and IP extraction
 */
import {
  checkRateLimit,
  cleanupRateLimits,
  getClientIP,
  rateLimitMiddleware,
} from '@/lib/rateLimit';

// We need to reset the internal rateLimitMap between tests.
// Since it's module-scoped, we clear it via cleanupRateLimits + time manipulation.

beforeEach(() => {
  jest.useFakeTimers();
  // Advance time far enough to expire all entries, then cleanup
  jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
  cleanupRateLimits();
  jest.useRealTimers();
});

// ============================================================
// checkRateLimit
// ============================================================
describe('checkRateLimit', () => {
  it('should allow first request', () => {
    const result = checkRateLimit('192.168.1.1', 'api');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('should track request count', () => {
    const r1 = checkRateLimit('user-count-test', 'api');
    const r2 = checkRateLimit('user-count-test', 'api');
    expect(r2.remaining).toBe(r1.remaining - 1);
  });

  it('should block after exceeding login limit (5 attempts)', () => {
    const ip = 'login-test-ip';
    for (let i = 0; i < 5; i++) {
      checkRateLimit(ip, 'login');
    }
    const result = checkRateLimit(ip, 'login');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should block after exceeding upload limit (10 attempts)', () => {
    const ip = 'upload-test-ip';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 'upload');
    }
    const result = checkRateLimit(ip, 'upload');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should block after exceeding api limit (100 requests)', () => {
    const ip = 'api-limit-test';
    for (let i = 0; i < 100; i++) {
      checkRateLimit(ip, 'api');
    }
    const result = checkRateLimit(ip, 'api');
    expect(result.allowed).toBe(false);
  });

  it('should use api config for unknown types', () => {
    const result = checkRateLimit('unknown-type-test', 'nonexistent');
    expect(result.allowed).toBe(true);
    // Should behave like api (100 requests per minute)
  });

  it('should separate limits by type for same identifier', () => {
    const ip = 'multi-type-ip';
    // Use up all login attempts
    for (let i = 0; i < 6; i++) {
      checkRateLimit(ip, 'login');
    }
    // API should still be allowed
    const apiResult = checkRateLimit(ip, 'api');
    expect(apiResult.allowed).toBe(true);
  });

  it('should reset after window expires', () => {
    jest.useFakeTimers();
    const ip = 'reset-test-ip';

    // Use up all login attempts
    for (let i = 0; i < 6; i++) {
      checkRateLimit(ip, 'login');
    }
    expect(checkRateLimit(ip, 'login').allowed).toBe(false);

    // Advance past the 15-minute window
    jest.advanceTimersByTime(16 * 60 * 1000);

    const result = checkRateLimit(ip, 'login');
    expect(result.allowed).toBe(true);

    jest.useRealTimers();
  });

  it('should include resetTime in response', () => {
    const result = checkRateLimit('reset-time-test', 'api');
    expect(result.resetTime).toBeDefined();
    expect(typeof result.resetTime).toBe('number');
    expect(result.resetTime).toBeGreaterThan(Date.now() - 1000);
  });

  it('should return retryAfter=0 when allowed', () => {
    const result = checkRateLimit('retry-after-test', 'api');
    expect(result.retryAfter).toBe(0);
  });
});

// ============================================================
// cleanupRateLimits
// ============================================================
describe('cleanupRateLimits', () => {
  it('should remove expired entries', () => {
    jest.useFakeTimers();

    // Create an entry
    checkRateLimit('cleanup-test', 'login');

    // Advance past the window
    jest.advanceTimersByTime(16 * 60 * 1000);

    cleanupRateLimits();

    // New request should get fresh limits
    const result = checkRateLimit('cleanup-test', 'login');
    expect(result.allowed).toBe(true);
    // remaining should be max - 1 (fresh entry)
    expect(result.remaining).toBe(4); // 5 max - 1

    jest.useRealTimers();
  });
});

// ============================================================
// getClientIP
// ============================================================
describe('getClientIP', () => {
  function mockHeaders(headerMap) {
    return {
      headers: {
        get: (name) => headerMap[name] || null,
      },
    };
  }

  it('should extract IP from x-forwarded-for (first entry)', () => {
    const req = mockHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIP(req)).toBe('1.2.3.4');
  });

  it('should extract IP from x-real-ip', () => {
    const req = mockHeaders({ 'x-real-ip': '10.0.0.1' });
    expect(getClientIP(req)).toBe('10.0.0.1');
  });

  it('should extract IP from cf-connecting-ip', () => {
    const req = mockHeaders({ 'cf-connecting-ip': '172.16.0.1' });
    expect(getClientIP(req)).toBe('172.16.0.1');
  });

  it('should prefer x-forwarded-for over x-real-ip', () => {
    const req = mockHeaders({
      'x-forwarded-for': '1.2.3.4',
      'x-real-ip': '5.6.7.8',
    });
    expect(getClientIP(req)).toBe('1.2.3.4');
  });

  it('should return "unknown" when no headers present', () => {
    const req = mockHeaders({});
    expect(getClientIP(req)).toBe('unknown');
  });

  it('should trim whitespace from forwarded IP', () => {
    const req = mockHeaders({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' });
    expect(getClientIP(req)).toBe('1.2.3.4');
  });
});

// ============================================================
// rateLimitMiddleware
// ============================================================
describe('rateLimitMiddleware', () => {
  function mockRequest(ip) {
    return {
      headers: {
        get: (name) => (name === 'x-forwarded-for' ? ip : null),
      },
    };
  }

  it('should allow first request from an IP', () => {
    const req = mockRequest('middleware-test-ip');
    const result = rateLimitMiddleware(req, 'api');
    expect(result.allowed).toBe(true);
  });

  it('should use the specified rate limit type', () => {
    const req = mockRequest('middleware-login-ip');

    // Exhaust login limit (5 attempts)
    for (let i = 0; i < 5; i++) {
      rateLimitMiddleware(req, 'login');
    }

    const result = rateLimitMiddleware(req, 'login');
    expect(result.allowed).toBe(false);
  });

  it('should default to api type', () => {
    const req = mockRequest('middleware-default-ip');
    const result = rateLimitMiddleware(req);
    expect(result.allowed).toBe(true);
  });
});
