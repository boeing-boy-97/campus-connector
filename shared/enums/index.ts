// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — SHARED ENUMERATIONS                                   ║
// ║  Used by both backend (Cloud Functions) and admin panel (React)         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum ReportCategory {
  PROFILE = 'profile',
  CHAT = 'chat',
  PHOTO = 'photo',
  OTHER = 'other',
}

export enum CollegeVerifiedStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum MatchType {
  DATING = 'dating',
  FRIENDSHIP = 'friendship',
  STUDY = 'study',
  HACKATHON = 'hackathon',
  PROJECT = 'project',
}

export enum MatchStatus {
  ACTIVE = 'active',
  UNMATCHED = 'unmatched',
}

export enum ConnectRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

export enum MessageMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum ReportReason {
  HARASSMENT = 'harassment',
  FAKE_PROFILE = 'fake_profile',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  SPAM = 'spam',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  ACTION_TAKEN = 'action_taken',
  DISMISSED = 'dismissed',
}

export enum NotificationType {
  NEW_MATCH = 'new_match',
  NEW_MESSAGE = 'new_message',
  CONNECT_REQUEST = 'connect_request',
  VERIFICATION_APPROVED = 'verification_approved',
  VERIFICATION_REJECTED = 'verification_rejected',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_REINSTATED = 'account_reinstated',
  ADMIN_ANNOUNCEMENT = 'admin_announcement',
}

export enum UserRole {
  STUDENT = 'student',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

export enum OtpPurpose {
  SIGNUP = 'signup',
  LOGIN = 'login',
  DELETE_ACCOUNT = 'delete_account',
}
