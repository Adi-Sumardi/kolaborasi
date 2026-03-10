/**
 * Unit tests for lib/sanitize.js
 * Tests XSS protection, email validation, input sanitization, and password validation
 */
import {
  sanitizeString,
  sanitizeEmail,
  sanitizeUserInput,
  validatePasswordStrength,
  validators,
} from '@/lib/sanitize';

// ============================================================
// sanitizeString — XSS Protection
// ============================================================
describe('sanitizeString', () => {
  it('should strip <script> tags', () => {
    const result = sanitizeString('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('should strip onclick attributes', () => {
    const result = sanitizeString('<div onclick="alert(1)">hello</div>');
    expect(result).not.toContain('onclick');
  });

  it('should strip javascript: protocol in href', () => {
    const result = sanitizeString('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('should strip <img onerror> attacks', () => {
    const result = sanitizeString('<img src=x onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('should preserve safe text content', () => {
    expect(sanitizeString('Hello World')).toBe('Hello World');
  });

  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('should return non-string input as-is', () => {
    expect(sanitizeString(42)).toBe(42);
    expect(sanitizeString(null)).toBeNull();
    expect(sanitizeString(undefined)).toBeUndefined();
    expect(sanitizeString(true)).toBe(true);
  });

  it('should handle empty string', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('should strip nested malicious tags', () => {
    const result = sanitizeString('<div><script>evil()</script></div>');
    expect(result).not.toContain('<script>');
  });
});

// ============================================================
// sanitizeEmail
// ============================================================
describe('sanitizeEmail', () => {
  it('should normalize valid email', () => {
    const result = sanitizeEmail('  User@Example.COM  ');
    expect(result).toContain('example.com');
    expect(result).toContain('user');
  });

  it('should return empty string for invalid email', () => {
    expect(sanitizeEmail('not-an-email')).toBe('');
    expect(sanitizeEmail('missing@')).toBe('');
    expect(sanitizeEmail('@nodomain')).toBe('');
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeEmail(42)).toBe('');
    expect(sanitizeEmail(null)).toBe('');
    expect(sanitizeEmail(undefined)).toBe('');
  });

  it('should handle valid email without changes needed', () => {
    const result = sanitizeEmail('valid@email.com');
    expect(result).toBe('valid@email.com');
  });
});

// ============================================================
// sanitizeUserInput
// ============================================================
describe('sanitizeUserInput', () => {
  it('should sanitize string values', () => {
    const result = sanitizeUserInput({ name: '<script>x</script>Hello' });
    expect(result.name).not.toContain('<script>');
    expect(result.name).toContain('Hello');
  });

  it('should sanitize email fields specially', () => {
    const result = sanitizeUserInput({ email: '  ADMIN@test.COM  ' });
    expect(result.email).toContain('test.com');
  });

  it('should preserve null and undefined values', () => {
    const result = sanitizeUserInput({ a: null, b: undefined });
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
  });

  it('should preserve numbers and booleans', () => {
    const result = sanitizeUserInput({ age: 25, active: true });
    expect(result.age).toBe(25);
    expect(result.active).toBe(true);
  });

  it('should recursively sanitize nested objects', () => {
    const result = sanitizeUserInput({
      profile: { bio: '<script>hack</script>Legit bio' },
    });
    expect(result.profile.bio).not.toContain('<script>');
    expect(result.profile.bio).toContain('Legit bio');
  });

  it('should sanitize array elements', () => {
    const result = sanitizeUserInput({
      tags: ['<script>x</script>safe', 'clean'],
    });
    expect(result.tags[0]).not.toContain('<script>');
    expect(result.tags[1]).toBe('clean');
  });

  it('should not modify non-string array elements', () => {
    const result = sanitizeUserInput({ ids: [1, 2, 3] });
    expect(result.ids).toEqual([1, 2, 3]);
  });

  it('should handle deeply nested email fields', () => {
    const result = sanitizeUserInput({
      contact: { userEmail: 'BAD-EMAIL' },
    });
    // userEmail contains 'email', so it should be processed by sanitizeEmail
    expect(result.contact.userEmail).toBe('');
  });
});

// ============================================================
// validatePasswordStrength
// ============================================================
describe('validatePasswordStrength', () => {
  it('should reject null/undefined/empty password', () => {
    expect(validatePasswordStrength(null).isValid).toBe(false);
    expect(validatePasswordStrength(undefined).isValid).toBe(false);
    expect(validatePasswordStrength('').isValid).toBe(false);
    expect(validatePasswordStrength(null).errors).toContain('Password harus diisi');
  });

  it('should reject password shorter than 8 characters', () => {
    const result = validatePasswordStrength('Ab1');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password minimal 8 karakter');
  });

  it('should reject password without uppercase', () => {
    const result = validatePasswordStrength('abcdefg1');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password harus mengandung huruf besar');
  });

  it('should reject password without lowercase', () => {
    const result = validatePasswordStrength('ABCDEFG1');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password harus mengandung huruf kecil');
  });

  it('should reject password without number', () => {
    const result = validatePasswordStrength('Abcdefgh');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password harus mengandung angka');
  });

  it('should accept valid strong password', () => {
    const result = validatePasswordStrength('Abcdefg1');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.strength).toBe(4); // length + upper + lower + number
  });

  it('should give extra strength for special characters', () => {
    const result = validatePasswordStrength('Abcdefg1!');
    expect(result.isValid).toBe(true);
    expect(result.strength).toBe(5); // 4 + special char bonus
  });

  it('should return strength 0 for non-string', () => {
    const result = validatePasswordStrength(12345);
    expect(result.isValid).toBe(false);
    expect(result.strength).toBe(0);
  });
});

// ============================================================
// validators
// ============================================================
describe('validators', () => {
  describe('email', () => {
    it('should validate correct emails', () => {
      expect(validators.email('user@example.com')).toBe(true);
      expect(validators.email('user+tag@domain.co')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validators.email('invalid')).toBe(false);
      expect(validators.email('')).toBe(false);
      expect(validators.email(null)).toBe(false);
      expect(validators.email(undefined)).toBe(false);
    });
  });

  describe('password (strong policy)', () => {
    it('should accept valid passwords', () => {
      expect(validators.password('Abcdefg1')).toBe(true);
    });

    it('should reject weak passwords', () => {
      expect(validators.password('short')).toBe(false);
      expect(validators.password('alllowercase1')).toBe(false);
      expect(validators.password('ALLUPPERCASE1')).toBe(false);
      expect(validators.password('NoNumbers')).toBe(false);
      expect(validators.password(null)).toBe(false);
    });
  });

  describe('passwordLegacy', () => {
    it('should accept passwords with 6+ characters', () => {
      expect(validators.passwordLegacy('123456')).toBe(true);
    });

    it('should reject passwords shorter than 6', () => {
      expect(validators.passwordLegacy('12345')).toBe(false);
      expect(validators.passwordLegacy(null)).toBe(false);
    });
  });

  describe('url', () => {
    it('should validate URLs', () => {
      expect(validators.url('https://example.com')).toBe(true);
      expect(validators.url('http://test.org/path')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validators.url('not a url')).toBe(false);
      expect(validators.url(null)).toBe(false);
    });
  });

  describe('alphanumeric', () => {
    it('should validate alphanumeric strings', () => {
      expect(validators.alphanumeric('abc123')).toBe(true);
    });

    it('should reject strings with special chars', () => {
      expect(validators.alphanumeric('abc-123')).toBe(false);
      expect(validators.alphanumeric('')).toBe(false);
      expect(validators.alphanumeric(null)).toBe(false);
    });
  });

  describe('uuid', () => {
    it('should validate UUIDs', () => {
      expect(validators.uuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject non-UUIDs', () => {
      expect(validators.uuid('not-a-uuid')).toBe(false);
      expect(validators.uuid(null)).toBe(false);
    });
  });

  describe('notEmpty', () => {
    it('should return true for non-empty strings', () => {
      expect(validators.notEmpty('hello')).toBe(true);
    });

    it('should return false for empty/whitespace-only strings', () => {
      expect(validators.notEmpty('')).toBe(false);
      expect(validators.notEmpty('   ')).toBe(false);
      expect(validators.notEmpty(null)).toBe(false);
    });
  });
});
