// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  errors.ts — Typed error factory                                        ║
// ║  Wraps Firebase HttpsError with consistent codes and logging            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { ERROR_CODES } from '../../../../shared/constants';
import { logger } from './logger';

type FunctionsErrorCode =
  | 'ok' | 'cancelled' | 'unknown' | 'invalid-argument' | 'deadline-exceeded'
  | 'not-found' | 'already-exists' | 'permission-denied' | 'resource-exhausted'
  | 'failed-precondition' | 'aborted' | 'out-of-range' | 'unimplemented'
  | 'internal' | 'unavailable' | 'data-loss' | 'unauthenticated';

export interface AppErrorDetails {
  code: string;
  field?: string;
  context?: Record<string, unknown>;
}

/**
 * Creates a typed Firebase HttpsError with structured details
 */
export function createError(
  httpCode: FunctionsErrorCode,
  message: string,
  details?: AppErrorDetails
): functions.https.HttpsError {
  return new functions.https.HttpsError(httpCode, message, details);
}

// ─── Pre-defined error factories ──────────────────────────────────────────────

export const Errors = {
  unauthenticated: () =>
    createError('unauthenticated', 'Authentication required.', { code: ERROR_CODES.UNAUTHORIZED }),

  forbidden: (msg = 'You do not have permission to perform this action.') =>
    createError('permission-denied', msg, { code: ERROR_CODES.UNAUTHORIZED }),

  notFound: (entity = 'Resource') =>
    createError('not-found', `${entity} not found.`, { code: ERROR_CODES.NOT_FOUND }),

  invalidArgument: (msg: string, field?: string) =>
    createError('invalid-argument', msg, { code: ERROR_CODES.VALIDATION_FAILED, field }),

  alreadyExists: (msg: string) =>
    createError('already-exists', msg, { code: ERROR_CODES.VALIDATION_FAILED }),

  rateLimited: (msg: string) =>
    createError('resource-exhausted', msg, { code: ERROR_CODES.RATE_LIMIT }),

  preconditionFailed: (msg: string, code?: string) =>
    createError('failed-precondition', msg, { code: code || ERROR_CODES.VALIDATION_FAILED }),

  internal: (msg = 'An unexpected error occurred. Please try again.') =>
    createError('internal', msg, { code: ERROR_CODES.INTERNAL }),

  notVerified: () =>
    createError('failed-precondition', 'Your profile must be verified before you can do this.', {
      code: ERROR_CODES.NOT_VERIFIED,
    }),

  userSuspended: () =>
    createError('permission-denied', 'Your account has been suspended. Contact support@campusconnect.app.', {
      code: ERROR_CODES.USER_SUSPENDED,
    }),

  wrongCollege: () =>
    createError('permission-denied', 'You can only interact with students from your own college.', {
      code: ERROR_CODES.SAME_COLLEGE_REQUIRED,
    }),

  blocked: () =>
    createError('permission-denied', 'This action is not available.', { code: ERROR_CODES.USER_BLOCKED }),
};

/**
 * Wraps any thrown error into a proper HttpsError
 * Call in every catch block to normalize errors
 */
export function handleUnknownError(error: unknown, context: string): never {
  if (error instanceof functions.https.HttpsError) {
    throw error;
  }
  logger.error(`[${context}] Unhandled error:`, error);
  throw Errors.internal();
}
