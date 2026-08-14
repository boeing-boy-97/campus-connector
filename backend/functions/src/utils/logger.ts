// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  logger.ts — Structured logger with context tagging                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  timestamp: string;
}

function formatEntry(level: LogLevel, message: string, data?: unknown, context?: string): LogEntry {
  return {
    level,
    message,
    context,
    data,
    timestamp: new Date().toISOString(),
  };
}

export const logger = {
  debug: (message: string, data?: unknown, context?: string) => {
    if (process.env.FUNCTIONS_EMULATOR) {
      functions.logger.debug(formatEntry('debug', message, data, context));
    }
  },

  info: (message: string, data?: unknown, context?: string) => {
    functions.logger.info(formatEntry('info', message, data, context));
  },

  warn: (message: string, data?: unknown, context?: string) => {
    functions.logger.warn(formatEntry('warn', message, data, context));
  },

  error: (message: string, error?: unknown, context?: string) => {
    functions.logger.error(formatEntry('error', message, error, context));
  },
};

/**
 * Creates a context-scoped logger for a specific function
 * Usage: const log = createLogger('sendOtp');
 */
export function createLogger(functionName: string) {
  return {
    debug: (msg: string, data?: unknown) => logger.debug(msg, data, functionName),
    info: (msg: string, data?: unknown) => logger.info(msg, data, functionName),
    warn: (msg: string, data?: unknown) => logger.warn(msg, data, functionName),
    error: (msg: string, error?: unknown) => logger.error(msg, error, functionName),
  };
}
