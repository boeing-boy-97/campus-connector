import { FirebaseError } from 'firebase/app';
import { httpsCallable, type HttpsCallableOptions } from 'firebase/functions';
import { functions } from './firebase';
import type {
  BlockedUser,
  CollegeBranding,
  ConnectRequest,
  LoginPayload,
  Match,
  MatchType,
  Recommendations,
  Student,
  StudentPublicProfile,
} from '../types';

/** Envelope every Cloud Function returns. */
type ApiEnvelope<T> = { success: boolean; data?: T };

/** Error surfaced to the UI: always has a human-readable message. */
export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

/** Callable error codes that are worth retrying automatically. */
const RETRYABLE_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/aborted',
  'functions/cancelled',
  'unavailable',
  'deadline-exceeded',
]);

/** Codes for which a friendlier message than the server's is appropriate. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  'functions/unavailable':
    'We could not reach the server. Check your connection and try again.',
  'functions/deadline-exceeded':
    'That took longer than expected. Please try again.',
  'functions/internal':
    'Something went wrong on our side. Please try again in a moment.',
  'functions/unauthenticated':
    'Your session has expired. Please sign in again.',
};

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

function normaliseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof FirebaseError) {
    const code = error.code;
    // Callable errors arrive as "Firebase: message (functions/code)."
    const serverMessage = error.message
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\([^)]*\)\.?$/, '')
      .trim();
    const message = FRIENDLY_MESSAGES[code]
      ?? (serverMessage || 'Something went wrong. Please try again.');
    return new ApiError(message, code, RETRYABLE_CODES.has(code));
  }

  if (error instanceof Error) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new ApiError(
      offline ? 'You appear to be offline. Reconnect and try again.' : error.message,
      offline ? 'app/offline' : 'app/unknown',
      true,
    );
  }

  return new ApiError('Something went wrong. Please try again.', 'app/unknown', true);
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export interface CallOptions {
  /** Per-call timeout in milliseconds. */
  timeoutMs?: number;
  /** Total attempts including the first. Set to 1 to disable retries. */
  attempts?: number;
  /** Abort signal so a caller (e.g. an unmounting component) can cancel. */
  signal?: AbortSignal;
}

/**
 * Invokes a Cloud Function callable with a timeout, bounded exponential-backoff
 * retry for transient failures, and normalised errors.
 *
 * Mutations that are not idempotent should pass `attempts: 1` so a retry cannot
 * duplicate a side effect.
 */
export async function callFunction<TResult>(
  name: string,
  payload: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<TResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? MAX_ATTEMPTS);

  const callableOptions: HttpsCallableOptions = { timeout: timeoutMs };
  const callable = httpsCallable<Record<string, unknown>, ApiEnvelope<TResult>>(
    functions,
    name,
    callableOptions,
  );

  let lastError: ApiError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new ApiError('The request was cancelled.', 'app/aborted', false);
    }

    try {
      const result = await callable(payload);
      if (!result.data?.success) {
        throw new ApiError(
          'The server returned an unexpected response.',
          'app/invalid-response',
          true,
        );
      }
      return result.data.data as TResult;
    } catch (error) {
      lastError = normaliseError(error);
      const canRetry = lastError.retryable && attempt < attempts;
      if (!canRetry) throw lastError;
      // Exponential backoff with jitter, so a burst of clients does not
      // synchronise its retries against a struggling backend.
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 200);
    }
  }

  throw lastError ?? new ApiError('Request failed.', 'app/unknown', false);
}

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  const normalised = normaliseError(error);
  return normalised.code === 'app/unknown' && !normalised.message ? fallback : normalised.message;
}

// ─── Typed endpoint wrappers ──────────────────────────────────────────────────
// One place per endpoint keeps request shapes correct and prevents the payload
// drift that caused several silently-failing calls in this codebase.

export const api = {
  // Auth
  sendOtp: (email: string, consentVersion: string) =>
    callFunction<{ message: string; masked_email: string; expires_in_minutes: number }>(
      'sendOtp',
      { email, consent_given: true, consent_version: consentVersion },
      { attempts: 1, timeoutMs: 30_000 },
    ),

  verifyOtp: (email: string, otp: string) =>
    callFunction<{
      custom_token: string;
      uid: string;
      has_profile: boolean;
      college_id: string;
      college_name: string;
      is_new_user: boolean;
    }>('verifyOtp', { email, otp }, { attempts: 1, timeoutMs: 30_000 }),

  login: () => callFunction<LoginPayload>('login', {}, { attempts: 2 }),

  checkEmailDomain: (email: string) =>
    callFunction<{ is_registered: boolean; college: CollegeBranding | null }>(
      'checkEmailDomain',
      { email },
      { attempts: 2, timeoutMs: 10_000 },
    ),

  // Profile
  createProfile: (payload: Record<string, unknown>) =>
    callFunction<{ uid: string; next_step: string }>('createProfile', payload, { attempts: 1 }),

  updateProfile: (payload: Record<string, unknown>) =>
    callFunction<{ updated_fields: string[] }>('updateProfile', payload, { attempts: 1 }),

  updateProfilePhotos: (storagePaths: string[]) =>
    callFunction<{ profile_photos: string[] }>(
      'updateProfilePhotos',
      { storage_paths: storagePaths },
      { attempts: 1, timeoutMs: 45_000 },
    ),

  getOwnProfile: () => callFunction<Student>('getProfile', {}),

  getProfile: (studentId: string) =>
    callFunction<StudentPublicProfile>('getProfile', { student_id: studentId }),

  submitVerificationPhoto: (storagePath: string) =>
    callFunction<{ request_id: string; status: string }>(
      'submitVerificationPhoto',
      { storage_path: storagePath },
      { attempts: 1, timeoutMs: 30_000 },
    ),

  deleteAccount: (reason: string | undefined, feedback: string | undefined) =>
    callFunction<{ message: string }>(
      'deleteAccount',
      {
        confirmation: 'DELETE MY ACCOUNT',
        ...(reason ? { reason } : {}),
        ...(feedback ? { feedback } : {}),
      },
      { attempts: 1, timeoutMs: 60_000 },
    ),

  // College
  getCollegeBranding: (collegeId: string) =>
    callFunction<CollegeBranding>('getCollegeBranding', { college_id: collegeId }, { attempts: 2 }),

  // Discovery & matching
  getRecommendations: (params: {
    page_size?: number;
    last_doc_id?: string;
    match_type?: MatchType;
    year_filter?: number;
    gender_filter?: string;
  }) => callFunction<Recommendations>('getRecommendations', params, { attempts: 2 }),

  sendConnectRequest: (toId: string, matchType: MatchType, message?: string) =>
    callFunction<{ request_id: string }>(
      'sendConnectRequest',
      { to_id: toId, match_type: matchType, ...(message ? { message } : {}) },
      { attempts: 1 },
    ),

  respondToRequest: (requestId: string, action: 'accept' | 'decline') =>
    callFunction<{ match_id: string | null; status: string }>(
      'acceptConnectRequest',
      { request_id: requestId, action },
      { attempts: 1 },
    ),

  unmatch: (matchId: string) =>
    callFunction<void>('unmatch', { match_id: matchId }, { attempts: 1 }),

  // Chat
  sendMessage: (matchId: string, text?: string, mediaPath?: string) =>
    callFunction<{ message_id: string }>(
      'sendMessage',
      {
        match_id: matchId,
        ...(text ? { text } : {}),
        ...(mediaPath ? { media_path: mediaPath } : {}),
      },
      { attempts: 1, timeoutMs: 30_000 },
    ),

  markRead: (matchId: string) =>
    callFunction<{ marked_read_count: number }>('markRead', { match_id: matchId }, { attempts: 1 }),

  deleteMessage: (messageId: string) =>
    callFunction<void>('deleteMessage', { message_id: messageId }, { attempts: 1 }),

  // Safety
  reportUser: (payload: {
    reported_id: string;
    category: string;
    reason: string;
    description?: string;
  }) => callFunction<{ report_id: string }>('reportUser', payload, { attempts: 1 }),

  blockUser: (blockedId: string, reason?: string) =>
    callFunction<void>(
      'blockUser',
      { blocked_id: blockedId, ...(reason ? { reason } : {}) },
      { attempts: 1 },
    ),

  unblockUser: (blockedId: string) =>
    callFunction<void>('unblockUser', { blocked_id: blockedId }, { attempts: 1 }),

  getBlockedUsers: () =>
    callFunction<{ items: BlockedUser[] }>('getBlockedUsers', {}, { attempts: 2 }),

  // Notifications
  markNotificationsRead: (ids?: string[]) =>
    callFunction<{ updated_count: number }>(
      'markNotificationsRead',
      ids?.length ? { notification_ids: ids } : {},
      { attempts: 1 },
    ),
};

// ─── Profile cache ────────────────────────────────────────────────────────────

type CacheEntry = { profile: StudentPublicProfile; fetchedAt: number };

const PROFILE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<StudentPublicProfile>>();

/**
 * Fetches a peer profile, de-duplicating concurrent requests and caching the
 * result briefly.
 *
 * Connection rows, request rows and the chat header all need the same peer
 * profile; without this, one render of the Connections list issued one callable
 * invocation per row (and re-issued them on every re-render).
 */
export function fetchProfileCached(studentId: string): Promise<StudentPublicProfile> {
  const cached = profileCache.get(studentId);
  if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) {
    return Promise.resolve(cached.profile);
  }

  const existing = inFlight.get(studentId);
  if (existing) return existing;

  const request = api.getProfile(studentId)
    .then((profile) => {
      profileCache.set(studentId, { profile, fetchedAt: Date.now() });
      return profile;
    })
    .finally(() => {
      inFlight.delete(studentId);
    });

  inFlight.set(studentId, request);
  return request;
}

/** Drops cached peer profiles (used on sign-out so no data crosses sessions). */
export function clearProfileCache(): void {
  profileCache.clear();
  inFlight.clear();
}

export type { Match, ConnectRequest };
