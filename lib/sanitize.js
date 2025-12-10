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
 * Validate common input patterns
 */
export const validators = {
  email: (email) => {
    if (!email || typeof email !== 'string') return false;
    return validator.isEmail(email);
  },
  
  password: (password) => {
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

/**
 * Escape MongoDB special characters to prevent injection
 */
export const escapeMongoDB = (input) => {
  if (typeof input !== 'string') return input;
  
  // Escape special MongoDB operators
  return input.replace(/[$]/g, '\\$');
};
