// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  auth.middleware.ts — Authentication & authorization middleware          ║
// ║  Use these to guard Cloud Function handlers cleanly                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { VerificationStatus } from '../../../../shared/enums';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('auth.middleware');

export interface AuthContext {
  uid: string;
  email: string;
  collegeId: string;
  role: string;
  verificationStatus: VerificationStatus;
  isEmailVerified: boolean;
}

/**
 * Validates that the caller is authenticated and returns a typed AuthContext.
 * Throws if unauthenticated.
 */
export function requireAuth(context: functions.https.CallableContext): AuthContext {
  if (!context.auth) {
    throw Errors.unauthenticated();
  }

  const { uid, token } = context.auth;

  return {
    uid,
    email: token.email || '',
    collegeId: (token.college_id as string) || '',
    role: (token.role as string) || 'student',
    verificationStatus: (token.verification_status as VerificationStatus) || VerificationStatus.PENDING,
    isEmailVerified: token.email_verified || false,
  };
}

/**
 * Validates that the caller has admin role.
 */
export function requireAdmin(context: functions.https.CallableContext): AuthContext {
  const authCtx = requireAuth(context);
  if (authCtx.role !== 'admin') {
    log.warn(`Non-admin access attempt by ${authCtx.uid} (role: ${authCtx.role})`);
    throw Errors.forbidden('Admin access required.');
  }
  return authCtx;
}

/**
 * Validates that the caller is admin or moderator.
 */
export function requireModerator(context: functions.https.CallableContext): AuthContext {
  const authCtx = requireAuth(context);
  if (!['admin', 'moderator'].includes(authCtx.role)) {
    log.warn(`Non-moderator access attempt by ${authCtx.uid} (role: ${authCtx.role})`);
    throw Errors.forbidden('Moderator access required.');
  }
  return authCtx;
}

/**
 * Validates that the caller is verified (APPROVED verification status).
 * Also checks that the account is not suspended.
 */
export function requireVerified(context: functions.https.CallableContext): AuthContext {
  const authCtx = requireAuth(context);

  if (authCtx.verificationStatus === VerificationStatus.SUSPENDED) {
    throw Errors.userSuspended();
  }

  if (authCtx.verificationStatus !== VerificationStatus.APPROVED) {
    throw Errors.notVerified();
  }

  return authCtx;
}

/**
 * Validates that the caller has a college ID linked.
 * (Set at email verification time)
 */
export function requireCollegeLinked(context: functions.https.CallableContext): AuthContext {
  const authCtx = requireAuth(context);
  if (!authCtx.collegeId) {
    throw Errors.preconditionFailed(
      'Your account is not linked to a college. Please complete email verification.'
    );
  }
  return authCtx;
}

/**
 * Asserts that targetCollegeId matches the current user's college.
 * Protects cross-college data access.
 */
export function assertSameCollege(authCtx: AuthContext, targetCollegeId: string): void {
  if (authCtx.role === 'admin') return; // Admins can access any college
  if (authCtx.collegeId !== targetCollegeId) {
    log.warn(`Cross-college access attempt: user ${authCtx.uid} (college: ${authCtx.collegeId}) → target college: ${targetCollegeId}`);
    throw Errors.wrongCollege();
  }
}
