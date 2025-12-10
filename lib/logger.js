import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if exists
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  // Add stack trace for errors
  if (stack) {
    msg += `\n${stack}`;
  }
  
  return msg;
});

// Create logs directory if not exists
const logsDir = path.join(process.cwd(), 'logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Create transports
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
  }),
  
  // File transport for all logs (rotating daily)
  new DailyRotateFile({
    filename: path.join(logsDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d', // Keep logs for 14 days
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
  }),
  
  // Separate file for errors
  new DailyRotateFile({
    level: 'error',
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d', // Keep error logs for 30 days
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false, // Don't exit on uncaught errors
});

// Helper methods for different log levels
export const logInfo = (message, meta = {}) => {
  logger.info(message, meta);
};

export const logError = (message, error = null, meta = {}) => {
  if (error instanceof Error) {
    logger.error(message, { ...meta, error: error.message, stack: error.stack });
  } else {
    logger.error(message, { ...meta, error });
  }
};

export const logWarn = (message, meta = {}) => {
  logger.warn(message, meta);
};

export const logDebug = (message, meta = {}) => {
  logger.debug(message, meta);
};

export const logHttp = (message, meta = {}) => {
  logger.http(message, meta);
};

// Log API requests
export const logApiRequest = (method, url, statusCode, duration, userId = null) => {
  logHttp('API Request', {
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
    userId,
  });
};

// Log security events
export const logSecurityEvent = (event, userId = null, meta = {}) => {
  logWarn('Security Event', {
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// Log database operations
export const logDbOperation = (operation, collection, success, duration = null) => {
  const message = `DB ${operation} on ${collection}`;
  const metadata = { operation, collection, success };
  
  if (duration) {
    metadata.duration = `${duration}ms`;
  }
  
  if (success) {
    logDebug(message, metadata);
  } else {
    logError(message, null, metadata);
  }
};

export default logger;
