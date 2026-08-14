// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — SHARED CONSTANTS                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─── OTP Configuration ────────────────────────────────────────────────────────
export const OTP_CONSTANTS = {
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 3,
  RATE_LIMIT_WINDOW_MINUTES: 10,
  MAX_SENDS_PER_WINDOW: 3,
} as const;

// ─── Profile Limits ────────────────────────────────────────────────────────────
export const PROFILE_LIMITS = {
  MAX_PROFILE_PHOTOS: 6,
  MAX_BIO_LENGTH: 500,
  MAX_NAME_LENGTH: 100,
  MAX_INTERESTS: 20,
  MAX_INTEREST_LENGTH: 30,
  MIN_AGE_YEARS: 18,
} as const;

// ─── Chat Limits ──────────────────────────────────────────────────────────────
export const CHAT_LIMITS = {
  MAX_MESSAGE_LENGTH: 2000,
  MAX_INTRO_MESSAGE_LENGTH: 200,
  MAX_MEDIA_SIZE_MB: 25,
} as const;

// ─── Report Limits ────────────────────────────────────────────────────────────
export const REPORT_LIMITS = {
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_EVIDENCE_PHOTOS: 3,
} as const;

// ─── Pagination ───────────────────────────────────────────────────────────────
export const PAGINATION = {
  DISCOVERY_PAGE_SIZE: 20,
  MATCHES_PAGE_SIZE: 20,
  MESSAGES_PAGE_SIZE: 50,
  NOTIFICATIONS_PAGE_SIZE: 30,
  ADMIN_PAGE_SIZE: 25,
} as const;

// ─── Privacy Policy & Terms Versioning ───────────────────────────────────────
export const LEGAL = {
  CURRENT_PRIVACY_VERSION: '1.0.0',
  CURRENT_TERMS_VERSION: '1.0.0',
  PRIVACY_POLICY_URL: 'https://campusconnect.app/privacy',
  TERMS_URL: 'https://campusconnect.app/terms',
} as const;

export const BUSINESS_RULES = {
  MIN_AGE: 18,
} as const;

// ─── Firebase Collection Names ────────────────────────────────────────────────
export const COLLECTIONS = {
  COLLEGES: 'colleges',
  STUDENTS: 'students',
  VERIFICATION_REQUESTS: 'verification_requests',
  CONNECT_REQUESTS: 'connect_requests',
  MATCHES: 'matches',
  MESSAGES: 'messages',
  REPORTS: 'reports',
  BLOCKS: 'blocks',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
  OTP_RECORDS: 'otp_records',
  RATE_LIMITS: 'rate_limits',
} as const;

// ─── Firebase Storage Paths ───────────────────────────────────────────────────
export const STORAGE_PATHS = {
  PROFILE_PHOTOS: (userId: string) => `profile_photos/${userId}`,
  VERIFICATION_PHOTOS: (userId: string) => `verification_photos/${userId}`,
  CHAT_MEDIA: (matchId: string) => `chat_media/${matchId}`,
  COLLEGE_ASSETS: (collegeId: string) => `college_assets/${collegeId}`,
} as const;

// ─── Error Codes ──────────────────────────────────────────────────────────────
export const ERROR_CODES = {
  // Auth
  INVALID_DOMAIN: 'auth/invalid-domain',
  OTP_EXPIRED: 'auth/otp-expired',
  OTP_INVALID: 'auth/otp-invalid',
  OTP_MAX_ATTEMPTS: 'auth/otp-max-attempts',
  OTP_RATE_LIMIT: 'auth/otp-rate-limit',
  EMAIL_ALREADY_REGISTERED: 'auth/email-already-registered',
  USER_SUSPENDED: 'auth/user-suspended',
  // Profile
  PROFILE_INCOMPLETE: 'profile/incomplete',
  VERIFICATION_PENDING: 'profile/verification-pending',
  NOT_VERIFIED: 'profile/not-verified',
  AGE_RESTRICTION: 'profile/age-restriction',
  // Matching
  ALREADY_REQUESTED: 'match/already-requested',
  SAME_COLLEGE_REQUIRED: 'match/same-college-required',
  USER_BLOCKED: 'match/user-blocked',
  // Chat
  NOT_MATCHED: 'chat/not-matched',
  MATCH_INACTIVE: 'chat/match-inactive',
  // General
  UNAUTHORIZED: 'general/unauthorized',
  NOT_FOUND: 'general/not-found',
  VALIDATION_FAILED: 'general/validation-failed',
  RATE_LIMIT: 'general/rate-limit',
  INTERNAL: 'general/internal-error',
} as const;
