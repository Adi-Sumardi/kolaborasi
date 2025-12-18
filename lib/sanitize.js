// Input Sanitization Utilities
import validator from 'validator';
import xss from 'xss';

/**
 * Sanitize string input to prevent XSS attacks
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  return xss(validator.trim(input));
};

/**
 * Sanitize email
 */
export const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  const trimmed = validator.trim(email.toLowerCase());
  return validator.isEmail(trimmed) ? validator.normalizeEmail(trimmed) : '';
};

/**
 * Validate and sanitize user input object
 */
export const sanitizeUserInput = (data) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
      continue;
    }
    
    // Handle different data types
    if (typeof value === 'string') {
      // Special handling for email fields
      if (key.toLowerCase().includes('email')) {
        sanitized[key] = sanitizeEmail(value);
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeUserInput(value);
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else {
      // Keep other types as-is (numbers, booleans, etc.)
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Password validation result with detailed feedback
 */
export const validatePasswordStrength = (password) => {
  const result = {
    isValid: false,
    errors: [],
    strength: 0 // 0-4 scale
  };

  if (!password || typeof password !== 'string') {
    result.errors.push('Password harus diisi');
    return result;
  }

  // Check minimum length (8 characters for production)
  if (password.length < 8) {
    result.errors.push('Password minimal 8 karakter');
  } else {
    result.strength++;
  }

  // Check for uppercase letter
  if (!/[A-Z]/.test(password)) {
    result.errors.push('Password harus mengandung huruf besar');
  } else {
    result.strength++;
  }

  // Check for lowercase letter
  if (!/[a-z]/.test(password)) {
    result.errors.push('Password harus mengandung huruf kecil');
  } else {
    result.strength++;
  }

  // Check for number
  if (!/[0-9]/.test(password)) {
    result.errors.push('Password harus mengandung angka');
  } else {
    result.strength++;
  }

  // Optional: Check for special character (adds to strength but not required)
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    result.strength++;
  }

  result.isValid = result.errors.length === 0;
  return result;
};

/**
 * Validate common input patterns
 */
export const validators = {
  email: (email) => {
    if (!email || typeof email !== 'string') return false;
    return validator.isEmail(email);
  },

  /**
   * Password validation - enforces strong password policy
   * Requirements:
   * - Minimum 8 characters
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one number
   */
  password: (password) => {
    if (!password || typeof password !== 'string') return false;

    // Minimum 8 characters
    if (password.length < 8) return false;

    // Must contain uppercase
    if (!/[A-Z]/.test(password)) return false;

    // Must contain lowercase
    if (!/[a-z]/.test(password)) return false;

    // Must contain number
    if (!/[0-9]/.test(password)) return false;

    return true;
  },

  /**
   * Legacy password validation (for backwards compatibility during transition)
   * Use this only for login, not for registration/password change
   */
  passwordLegacy: (password) => {
    if (!password || typeof password !== 'string') return false;
    return password.length >= 6;
  },

  url: (url) => {
    if (!url || typeof url !== 'string') return false;
    return validator.isURL(url);
  },

  alphanumeric: (str) => {
    if (!str || typeof str !== 'string') return false;
    return validator.isAlphanumeric(str);
  },

  uuid: (str) => {
    if (!str || typeof str !== 'string') return false;
    return validator.isUUID(str);
  },

  notEmpty: (str) => {
    if (!str || typeof str !== 'string') return false;
    return !validator.isEmpty(validator.trim(str));
  }
};

