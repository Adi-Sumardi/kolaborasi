/**
 * @jest-environment node
 */

/**
 * Auth API Tests
 *
 * Tests for POST /api/auth/login, POST /api/auth/register, GET /api/auth/me
 */

import { GET, POST } from '@/app/api/[[...path]]/route';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('$2b$10$hashedpassword')),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn(),
}));

jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({ base32: 'MOCK_SECRET_BASE32' })),
  totp: {
    verify: jest.fn(),
  },
  otpauthURL: jest.fn(() => 'otpauth://totp/test'),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,mockqr')),
}));

jest.mock('@/lib/socket-server', () => ({
  sendNotification: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeUserInput: jest.fn((d) => d),
  sanitizeEmail: jest.fn((e) => (e ? e.toLowerCase().trim() : '')),
  sanitizeString: jest.fn((s) => s),
  validators: { email: jest.fn(() => true) },
  validatePasswordStrength: jest.fn(() => ({ isValid: true, errors: [] })),
}));

jest.mock('@/lib/rateLimit', () => ({
  rateLimitMiddleware: jest.fn(() => ({ allowed: true })),
  getClientIP: jest.fn(() => '127.0.0.1'),
}));

jest.mock('@/lib/emailService', () => ({
  sendSubmissionNotificationEmail: jest.fn(),
}));

jest.mock('@/lib/push-notifications', () => ({
  getVapidPublicKey: jest.fn(),
  sendPushNotification: jest.fn(),
  sendBulkPushNotifications: jest.fn(),
}));

const { query } = require('@/lib/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { validators, validatePasswordStrength } = require('@/lib/sanitize');
const { rateLimitMiddleware } = require('@/lib/rateLimit');

// Helper to create mock Request
function createRequest(method, path, body = null, headers = {}) {
  const url = `http://localhost:3000/api/${path}`;
  const options = {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const req = new Request(url, options);
  return req;
}

function pathParams(path) {
  return { params: { path: path.split('/') } };
}

describe('API: Auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validators.email.mockReturnValue(true);
    validatePasswordStrength.mockReturnValue({ isValid: true, errors: [] });
    rateLimitMiddleware.mockReturnValue({ allowed: true });
  });

  // ==========================================
  // POST /api/auth/login
  // ==========================================
  describe('POST /api/auth/login', () => {
    const loginPath = 'auth/login';

    it('should return token and user on valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'admin@test.com',
        name: 'Admin User',
        password: '$2b$10$hashedpassword',
        role: 'super_admin',
        division_id: null,
        two_factor_enabled: false,
        two_factor_secret: 'MOCK_SECRET',
      };

      query.mockResolvedValueOnce({ rows: [mockUser] }); // SELECT user
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE last login
      bcrypt.compare.mockResolvedValueOnce(true);

      const req = createRequest('POST', loginPath, {
        email: 'admin@test.com',
        password: 'StrongP@ss1',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.token).toBe('mock-jwt-token');
      expect(data.user.email).toBe('admin@test.com');
      expect(data.user.role).toBe('super_admin');
    });

    it('should return 401 for invalid password', async () => {
      query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'admin@test.com',
          password: '$2b$10$hashedpassword',
          two_factor_enabled: false,
        }],
      });
      bcrypt.compare.mockResolvedValueOnce(false);

      const req = createRequest('POST', loginPath, {
        email: 'admin@test.com',
        password: 'wrongpassword',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('POST', loginPath, {
        email: 'nobody@test.com',
        password: 'password123',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should return 400 when email or password is missing', async () => {
      const req = createRequest('POST', loginPath, { email: '', password: '' });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Email and password required');
    });

    it('should return require2FA when 2FA is enabled but code not provided', async () => {
      const mockUser = {
        id: 1,
        email: 'admin@test.com',
        password: '$2b$10$hashedpassword',
        two_factor_enabled: true,
        two_factor_secret: 'MOCK_SECRET',
      };

      query.mockResolvedValueOnce({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValueOnce(true);

      const req = createRequest('POST', loginPath, {
        email: 'admin@test.com',
        password: 'StrongP@ss1',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.require2FA).toBe(true);
    });

    it('should return 401 for invalid 2FA code', async () => {
      const mockUser = {
        id: 1,
        email: 'admin@test.com',
        password: '$2b$10$hashedpassword',
        two_factor_enabled: true,
        two_factor_secret: 'MOCK_SECRET',
      };

      query.mockResolvedValueOnce({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValueOnce(true);
      speakeasy.totp.verify.mockReturnValueOnce(false);

      const req = createRequest('POST', loginPath, {
        email: 'admin@test.com',
        password: 'StrongP@ss1',
        twoFactorCode: '000000',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Invalid 2FA code');
    });

    it('should login successfully with valid 2FA code', async () => {
      const mockUser = {
        id: 1,
        email: 'admin@test.com',
        name: 'Admin',
        password: '$2b$10$hashedpassword',
        role: 'super_admin',
        division_id: null,
        two_factor_enabled: true,
        two_factor_secret: 'MOCK_SECRET',
      };

      query.mockResolvedValueOnce({ rows: [mockUser] }); // SELECT user
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE last login
      bcrypt.compare.mockResolvedValueOnce(true);
      speakeasy.totp.verify.mockReturnValueOnce(true);

      const req = createRequest('POST', loginPath, {
        email: 'admin@test.com',
        password: 'StrongP@ss1',
        twoFactorCode: '123456',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.token).toBe('mock-jwt-token');
    });

    it('should return 429 when rate limited', async () => {
      rateLimitMiddleware.mockReturnValueOnce({
        allowed: false,
        retryAfter: 60,
        resetTime: Date.now() + 60000,
      });

      const req = createRequest('POST', loginPath, {
        email: 'admin@test.com',
        password: 'password',
      });

      const res = await POST(req, pathParams(loginPath));
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toMatch(/Too many login attempts/);
    });
  });

  // ==========================================
  // POST /api/auth/register
  // ==========================================
  describe('POST /api/auth/register', () => {
    const registerPath = 'auth/register';

    it('should register a new user successfully', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // no existing user
      query.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // INSERT returning id

      const req = createRequest('POST', registerPath, {
        email: 'newuser@test.com',
        password: 'StrongP@ss123!',
        name: 'New User',
        role: 'karyawan',
      });

      const res = await POST(req, pathParams(registerPath));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('User registered successfully');
      expect(data.userId).toBe(5);
    });

    it('should return 400 for duplicate email', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing user found

      const req = createRequest('POST', registerPath, {
        email: 'existing@test.com',
        password: 'StrongP@ss123!',
        name: 'Existing User',
        role: 'karyawan',
      });

      const res = await POST(req, pathParams(registerPath));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Email already registered');
    });

    it('should return 400 for missing required fields', async () => {
      const req = createRequest('POST', registerPath, {
        email: 'test@test.com',
        // missing password, name, role
      });

      const res = await POST(req, pathParams(registerPath));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Missing or invalid/);
    });

    it('should return 400 for weak password', async () => {
      validatePasswordStrength.mockReturnValueOnce({
        isValid: false,
        errors: ['Password must be at least 8 characters'],
      });

      const req = createRequest('POST', registerPath, {
        email: 'test@test.com',
        password: '123',
        name: 'Test User',
        role: 'karyawan',
      });

      const res = await POST(req, pathParams(registerPath));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.details).toContain('Password must be at least 8 characters');
    });
  });

  // ==========================================
  // GET /api/auth/me
  // ==========================================
  describe('GET /api/auth/me', () => {
    const mePath = 'auth/me';

    it('should return current user with valid token', async () => {
      jwt.verify.mockReturnValueOnce({ userId: 1, email: 'admin@test.com', role: 'super_admin' });

      query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'super_admin',
          division_id: 2,
          two_factor_enabled: false,
          profile_photo: null,
          division_name: 'Engineering',
        }],
      });

      const req = createRequest('GET', mePath, null, {
        Authorization: 'Bearer valid-token',
      });

      const res = await GET(req, pathParams(mePath));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe(1);
      expect(data.email).toBe('admin@test.com');
      expect(data.role).toBe('super_admin');
      expect(data.division.name).toBe('Engineering');
    });

    it('should return 401 with invalid/expired token', async () => {
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      const req = createRequest('GET', mePath, null, {
        Authorization: 'Bearer expired-token',
      });

      const res = await GET(req, pathParams(mePath));
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 with no authorization header', async () => {
      const req = createRequest('GET', mePath);

      const res = await GET(req, pathParams(mePath));
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 if user no longer exists in database', async () => {
      jwt.verify.mockReturnValueOnce({ userId: 999, email: 'gone@test.com', role: 'karyawan' });
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('GET', mePath, null, {
        Authorization: 'Bearer valid-token',
      });

      const res = await GET(req, pathParams(mePath));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });
});
