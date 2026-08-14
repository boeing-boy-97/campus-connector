// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — SHARED TYPE DEFINITIONS                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import {
  VerificationStatus,
  CollegeVerifiedStatus,
  Gender,
  MatchType,
  MatchStatus,
  ConnectRequestStatus,
  MessageMediaType,
  ReportReason,
  ReportStatus,
  NotificationType,
  UserRole,
} from '../enums';
import { Timestamp } from 'firebase-admin/firestore';

// ─── Firestore Timestamp alias ────────────────────────────────────────────────
export type FirestoreTimestamp = Timestamp;

// ─── College ──────────────────────────────────────────────────────────────────
export interface College {
  id: string;
  name: string;
  short_name: string;
  domain: string; // e.g. 'jdcollege.edu.in'
  logo_url: string;
  primary_color: string;   // hex
  secondary_color: string; // hex
  city: string;
  state: string;
  verified_status: CollegeVerifiedStatus;
  student_count?: number;
  created_at: FirestoreTimestamp;
  approved_at?: FirestoreTimestamp;
  approved_by?: string;
}

// ─── Student Intent Flags ─────────────────────────────────────────────────────
export interface IntentFlags {
  dating: boolean;
  friendship: boolean;
  study: boolean;
  hackathon: boolean;
  project: boolean;
}

// ─── Student ──────────────────────────────────────────────────────────────────
export interface Student {
  id: string;                               // Firebase Auth UID
  college_id: string;                       // FK → colleges.id
  college_email: string;
  phone?: string;
  full_name: string;
  branch: string;
  year: 1 | 2 | 3 | 4 | 5 | 6;
  bio: string;
  date_of_birth: FirestoreTimestamp;
  gender: Gender;
  profile_photos: string[];                 // max 6 photo URLs
  verification_photo_path?: string;         // PRIVATE Storage path — never sent to peers
  verification_submitted_at?: FirestoreTimestamp;
  rejection_reason?: string;
  verified_at?: FirestoreTimestamp;
  verification_status: VerificationStatus;
  /** Status held before a suspension, restored on reinstatement. */
  previous_verification_status?: VerificationStatus;
  suspended_at?: FirestoreTimestamp;
  suspended_by?: string;
  suspension_reason?: string;
  reinstated_at?: FirestoreTimestamp;
  reinstated_by?: string;
  intent_flags: IntentFlags;
  interests: string[];
  linkedin_url?: string;
  github_url?: string;
  is_active: boolean;
  is_profile_complete: boolean;
  last_seen?: FirestoreTimestamp;
  fcm_token?: string;
  consent_given_at: FirestoreTimestamp;
  consent_version: string;
  deleted_at?: FirestoreTimestamp;
  deletion_reason?: string;
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

// Explicit allowlist for the profile shape visible to verified peers.
export type StudentPublicProfile = Pick<
  Student,
  | 'id'
  | 'college_id'
  | 'full_name'
  | 'branch'
  | 'year'
  | 'bio'
  | 'gender'
  | 'profile_photos'
  | 'verification_status'
  | 'intent_flags'
  | 'interests'
  | 'linkedin_url'
  | 'github_url'
  | 'is_active'
  | 'is_profile_complete'
  | 'created_at'
  | 'updated_at'
>;

// ─── Verification Request ─────────────────────────────────────────────────────
export interface VerificationRequest {
  id: string;
  student_id: string;
  college_id: string;
  storage_path: string;        // private Storage path; never expose directly to clients
  review_status: 'pending' | 'approved' | 'rejected';
  review_notes?: string;
  reviewed_by?: string;
  submitted_at: FirestoreTimestamp;
  reviewed_at?: FirestoreTimestamp;
}

// ─── Connect Request ──────────────────────────────────────────────────────────
export interface ConnectRequest {
  id: string;
  from_id: string;
  to_id: string;
  college_id: string;
  match_type: MatchType;
  status: ConnectRequestStatus;
  message?: string;
  created_at: FirestoreTimestamp;
  responded_at?: FirestoreTimestamp;
}

// ─── Match ────────────────────────────────────────────────────────────────────
export interface Match {
  id: string;
  student_a_id: string;
  student_b_id: string;
  college_id: string;
  match_type: MatchType;
  status: MatchStatus;
  matched_at: FirestoreTimestamp;
  last_message_at?: FirestoreTimestamp;
  last_message_preview?: string;
}

// ─── Message ──────────────────────────────────────────────────────────────────
export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  text?: string;
  media_path?: string;
  media_type?: MessageMediaType;
  sent_at: FirestoreTimestamp;
  read_at?: FirestoreTimestamp;
  is_deleted: boolean;
}

// ─── Report ───────────────────────────────────────────────────────────────────
export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  college_id: string;
  reason: ReportReason;
  description?: string;
  evidence_urls?: string[];
  status: ReportStatus;
  action_taken?: string;
  reviewed_by?: string;
  created_at: FirestoreTimestamp;
  reviewed_at?: FirestoreTimestamp;
}

// ─── Block ────────────────────────────────────────────────────────────────────
export interface Block {
  id: string; // {blocker_id}_{blocked_id}
  blocker_id: string;
  blocked_id: string;
  created_at: FirestoreTimestamp;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  is_read: boolean;
  created_at: FirestoreTimestamp;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_id: string;
  target_collection: string;
  details?: Record<string, unknown>;
  created_at: FirestoreTimestamp;
}

// ─── API Response types ───────────────────────────────────────────────────────
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ─── OTP Store (Firestore, TTL-based) ────────────────────────────────────────
export interface OtpRecord {
  email: string;
  otp_hash: string;   // scrypt hash of OTP
  attempt_count: number;
  expires_at: FirestoreTimestamp;
  college_id: string;
  college_name: string;
  consent_given: boolean;
  consent_version: string;
  created_at: FirestoreTimestamp;
}

// ─── Firebase Auth Custom Claims ─────────────────────────────────────────────
export interface CustomClaims {
  role: UserRole;
  college_id?: string;
  verification_status?: VerificationStatus;
}
