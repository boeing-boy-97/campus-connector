/**
 * Client-side view models.
 *
 * These intentionally mirror the server payloads in `shared/types` but keep
 * timestamps as the loose shape Firestore's web SDK returns (a `Timestamp`
 * object over a snapshot, an ISO string over a callable), so the UI can format
 * either without lying about the type.
 */

export type MatchType = 'dating' | 'friendship' | 'study' | 'hackathon' | 'project';

export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'deleted';

export type IntentFlags = Record<MatchType, boolean>;

/** Anything Firestore or a callable might hand back for a timestamp. */
export type TimestampLike =
  | { toDate: () => Date }
  | { seconds: number; nanoseconds?: number }
  | string
  | number
  | null
  | undefined;

export interface StudentPublicProfile {
  id: string;
  college_id?: string;
  full_name: string;
  branch?: string;
  year?: number;
  bio?: string;
  gender?: string;
  profile_photos?: string[];
  verification_status?: VerificationStatus;
  intent_flags?: IntentFlags;
  interests?: string[];
  linkedin_url?: string;
  github_url?: string;
  is_active?: boolean;
  is_profile_complete?: boolean;
  created_at?: TimestampLike;
  updated_at?: TimestampLike;
}

/** The signed-in user's own profile, which includes private fields. */
export interface Student extends StudentPublicProfile {
  college_email?: string;
  date_of_birth?: TimestampLike;
  verification_submitted_at?: TimestampLike;
  verified_at?: TimestampLike;
  rejection_reason?: string;
  suspension_reason?: string;
  last_seen?: TimestampLike;
  consent_version?: string;
}

export interface Match {
  id: string;
  student_a_id: string;
  student_b_id: string;
  participant_ids?: string[];
  college_id?: string;
  status: 'active' | 'unmatched';
  match_type?: MatchType;
  matched_at?: TimestampLike;
  last_message_at?: TimestampLike;
  last_message_preview?: string;
  /** Per-participant unread counters, keyed `unread_count_{uid}`. */
  [unreadKey: `unread_count_${string}`]: unknown;
}

/** A match paired with the resolved other participant's ID. */
export interface MatchWithPeer extends Match {
  peerId: string;
  unreadCount: number;
}

export interface ConnectRequest {
  id: string;
  from_id: string;
  to_id: string;
  college_id?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  match_type?: MatchType;
  message?: string;
  created_at?: TimestampLike;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  text?: string | null;
  media_path?: string | null;
  media_type?: 'image' | 'video' | null;
  sent_at?: TimestampLike;
  read_at?: TimestampLike;
  is_deleted?: boolean;
}

export interface AppNotification {
  id: string;
  user_id?: string;
  title?: string;
  body?: string;
  type?: string;
  is_read?: boolean;
  created_at?: TimestampLike;
}

export interface CollegeBranding {
  college_id: string;
  name: string;
  short_name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export interface LoginPayload {
  uid: string;
  has_profile: boolean;
  verification_status: VerificationStatus;
  college_id: string;
  branding: CollegeBranding | null;
}

export interface Recommendations {
  profiles: StudentPublicProfile[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface BlockedUser {
  blocked_id: string;
  full_name: string;
  reason: string | null;
  created_at: string | null;
}

export interface DiscoveryFilters {
  matchType: MatchType;
  year?: number;
  gender?: string;
}

export const MATCH_TYPES: MatchType[] = ['friendship', 'study', 'project', 'hackathon', 'dating'];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  friendship: 'Friendship',
  study: 'Study group',
  project: 'Project team',
  hackathon: 'Hackathon',
  dating: 'Dating',
};

export const MATCH_TYPE_DESCRIPTIONS: Record<MatchType, string> = {
  friendship: 'Meet like-minded people on campus',
  study: 'Find people to revise and learn with',
  project: 'Build something with co-founders and teammates',
  hackathon: 'Form a team for your next competition',
  dating: 'Look for a relationship within your college',
};

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'fake_profile', label: 'Fake or impersonating profile' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
] as const;

export const REPORT_CATEGORIES = [
  { value: 'profile', label: 'Their profile' },
  { value: 'chat', label: 'A conversation' },
  { value: 'photo', label: 'A photo' },
  { value: 'other', label: 'Something else' },
] as const;

export const DELETION_REASONS = [
  { value: 'not_useful', label: 'It is not useful to me' },
  { value: 'privacy_concerns', label: 'Privacy concerns' },
  { value: 'found_partner', label: 'I found what I was looking for' },
  { value: 'other', label: 'Another reason' },
] as const;
