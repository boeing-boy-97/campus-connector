// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  student.service.ts — Student profile business logic                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { db, auth as adminAuth, storage, FieldValue } from '../config/firebase';
import {
  getMatchDocsForParticipant,
  getStudent,
  toPublicStudentProfile,
  writeAuditLog,
} from '../utils/firestore.utils';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';
import {
  COLLECTIONS,
  PROFILE_LIMITS,
  STORAGE_PATHS,
} from '../../../../shared/constants';
import { MatchStatus, VerificationStatus } from '../../../../shared/enums';
import { Student } from '../../../../shared/types';
import { NotificationService } from './notification.service';

/** Content types accepted for profile photos (mirrors storage.rules). */
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PROFILE_PHOTO_BYTES = 8 * 1024 * 1024;

const log = createLogger('student.service');

export const StudentService = {

  /**
   * Fetches a student's own profile.
   */
  async getOwnProfile(uid: string) {
    const student = await getStudent(uid);
    if (!student) throw Errors.notFound('Profile');
    return student;
  },

  /**
   * Fetches another student's public profile (strips private fields).
   * Validates same-college access.
   */
  async getPublicProfile(targetId: string, requesterId: string, requesterCollegeId: string) {
    const target = await getStudent(targetId);
    if (!target || !target.is_active || target.deleted_at) {
      throw Errors.notFound('Student');
    }

    // Can only view profiles from same college
    if (target.college_id !== requesterCollegeId) {
      throw Errors.wrongCollege();
    }

    // Cannot view unverified profiles
    if (target.verification_status !== VerificationStatus.APPROVED) {
      throw Errors.notFound('Student');
    }

    return toPublicStudentProfile(target);
  },

  /**
   * Updates an existing student profile.
   * Enforces field-level restrictions (e.g., cannot change college_id or email).
   */
  async update(uid: string, updates: Partial<Student>): Promise<void> {
    const student = await getStudent(uid);
    if (!student) throw Errors.notFound('Profile');

    // These fields are immutable after creation
    const IMMUTABLE_FIELDS = ['college_id', 'college_email', 'id', 'verification_status', 'created_at'];
    for (const field of IMMUTABLE_FIELDS) {
      if (field in updates) {
        delete (updates as any)[field];
      }
    }

    await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
      ...updates,
      updated_at: FieldValue.serverTimestamp(),
    });
  },

  /**
   * Soft-deletes a student account (DPDP Act 2023 compliance).
   * Anonymizes PII, preserves aggregate data for safety purposes.
   */
  async deleteAccount(uid: string, reason?: string): Promise<void> {
    const student = await getStudent(uid);
    if (!student) throw Errors.notFound('Profile');

    const batch = db.batch();
    const studentRef = db.collection(COLLECTIONS.STUDENTS).doc(uid);

    // Anonymize student document
    batch.update(studentRef, {
      full_name: 'Deleted User',
      bio: null,
      profile_photos: [],
      college_email: `deleted_${uid}@anonymous.local`,
      phone: null,
      date_of_birth: null,
      branch: null,
      interests: [],
      fcm_token: null,
      is_active: false,
      is_profile_complete: false,
      verification_status: VerificationStatus.DELETED,
      deleted_at: FieldValue.serverTimestamp(),
      deletion_reason: reason || 'user_requested',
      updated_at: FieldValue.serverTimestamp(),
    });

    // Close every active match so the deleted account cannot be contacted.
    const activeMatches = await StudentService.getActiveMatchDocs(uid);
    activeMatches.forEach((document) => {
      batch.update(document.ref, {
        status: MatchStatus.UNMATCHED,
        unmatched_at: FieldValue.serverTimestamp(),
        unmatched_by: uid,
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    // Disable Firebase Auth account
    await adminAuth.updateUser(uid, { disabled: true });
    // Revoke tokens
    await adminAuth.revokeRefreshTokens(uid);

    await writeAuditLog({
      admin_id: uid, // Self-deletion
      action: 'delete_account',
      target_id: uid,
      target_collection: COLLECTIONS.STUDENTS,
      details: { reason },
    });

    log.info(`Account deleted for ${uid}`);
  },

  /**
   * Replaces a student's profile photo list.
   *
   * Clients upload directly to Cloud Storage under `profile_photos/{uid}/…`
   * (enforced by Storage rules) and then submit the resulting paths here.
   * Accepting only owned Storage paths — never arbitrary URLs — prevents a
   * client from injecting third-party or spoofed images into the feed.
   */
  async setProfilePhotos(uid: string, storagePaths: string[]): Promise<string[]> {
    const student = await getStudent(uid);
    if (!student) throw Errors.notFound('Profile');

    if (storagePaths.length > PROFILE_LIMITS.MAX_PROFILE_PHOTOS) {
      throw Errors.invalidArgument(
        `You can have at most ${PROFILE_LIMITS.MAX_PROFILE_PHOTOS} profile photos.`
      );
    }

    const unique = [...new Set(storagePaths)];
    if (unique.length !== storagePaths.length) {
      throw Errors.invalidArgument('Duplicate photos are not allowed.');
    }

    const prefix = `${STORAGE_PATHS.PROFILE_PHOTOS(uid)}/`;
    const bucket = storage.bucket();

    // Every path must belong to this user and actually exist in the bucket.
    const verified = await Promise.all(unique.map(async (path) => {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) {
        throw Errors.forbidden('Profile photos must be uploaded to your own folder.');
      }

      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) throw Errors.notFound('Uploaded photo');

      const [metadata] = await file.getMetadata();
      if (!ALLOWED_PHOTO_TYPES.has(metadata.contentType ?? '')) {
        throw Errors.invalidArgument('Profile photos must be JPEG, PNG, or WebP images.');
      }
      if (Number(metadata.size ?? 0) > MAX_PROFILE_PHOTO_BYTES) {
        throw Errors.invalidArgument('Each profile photo must be smaller than 8 MB.');
      }
      return path;
    }));

    await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
      profile_photos: verified,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Remove orphaned uploads so abandoned files do not accumulate cost.
    const retained = new Set(verified);
    const previous = Array.isArray(student.profile_photos) ? student.profile_photos : [];
    await Promise.all(
      previous
        .filter((path) => typeof path === 'string' && path.startsWith(prefix) && !retained.has(path))
        .map((path) => bucket.file(path).delete({ ignoreNotFound: true }).catch(() => undefined))
    );

    log.info(`Profile photos updated for ${uid} (${verified.length})`);
    return verified;
  },

  /**
   * Suspends a student after a moderator review.
   * Revokes refresh tokens so the suspension takes effect immediately, and
   * closes every active match to stop further contact.
   */
  async suspend(uid: string, moderatorId: string, reason: string): Promise<void> {
    const student = await getStudent(uid);
    if (!student) throw Errors.notFound('Student');
    if (student.verification_status === VerificationStatus.DELETED) {
      throw Errors.preconditionFailed('This account has already been deleted.');
    }
    if (student.verification_status === VerificationStatus.SUSPENDED) {
      throw Errors.preconditionFailed('This account is already suspended.');
    }

    const studentRef = db.collection(COLLECTIONS.STUDENTS).doc(uid);
    const batch = db.batch();

    batch.update(studentRef, {
      verification_status: VerificationStatus.SUSPENDED,
      previous_verification_status: student.verification_status,
      is_active: false,
      suspended_at: FieldValue.serverTimestamp(),
      suspended_by: moderatorId,
      suspension_reason: reason,
      updated_at: FieldValue.serverTimestamp(),
    });

    const activeMatches = await this.getActiveMatchDocs(uid);
    activeMatches.forEach((document) => batch.update(document.ref, {
      status: MatchStatus.UNMATCHED,
      unmatched_at: FieldValue.serverTimestamp(),
      unmatched_by: moderatorId,
    }));

    await batch.commit();

    // Claims + token revocation make the suspension effective on the next request.
    await StudentService.syncAuthClaims(uid);
    await adminAuth.revokeRefreshTokens(uid);

    await writeAuditLog({
      admin_id: moderatorId,
      action: 'suspend_user',
      target_id: uid,
      target_collection: COLLECTIONS.STUDENTS,
      details: { reason, closed_matches: activeMatches.length },
    });

    await NotificationService.accountSuspended({ userId: uid, reason });
    log.info(`Student ${uid} suspended by ${moderatorId}`);
  },

  /**
   * Reinstates a suspended student, restoring the verification state they held
   * before the suspension.
   */
  async reinstate(uid: string, moderatorId: string, notes?: string): Promise<void> {
    const student = await getStudent(uid);
    if (!student) throw Errors.notFound('Student');
    if (student.verification_status !== VerificationStatus.SUSPENDED) {
      throw Errors.preconditionFailed('This account is not suspended.');
    }

    const restored = student.previous_verification_status === VerificationStatus.APPROVED
      ? VerificationStatus.APPROVED
      : VerificationStatus.PENDING;

    await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
      verification_status: restored,
      previous_verification_status: FieldValue.delete(),
      is_active: true,
      suspended_at: FieldValue.delete(),
      suspended_by: FieldValue.delete(),
      suspension_reason: FieldValue.delete(),
      reinstated_at: FieldValue.serverTimestamp(),
      reinstated_by: moderatorId,
      updated_at: FieldValue.serverTimestamp(),
    });

    await StudentService.syncAuthClaims(uid);

    await writeAuditLog({
      admin_id: moderatorId,
      action: 'reinstate_user',
      target_id: uid,
      target_collection: COLLECTIONS.STUDENTS,
      details: { notes: notes ?? null, restored_status: restored },
    });

    await NotificationService.accountReinstated({ userId: uid });
    log.info(`Student ${uid} reinstated by ${moderatorId} → ${restored}`);
  },

  /** Every active match involving this student, in either participant slot. */
  async getActiveMatchDocs(uid: string) {
    return getMatchDocsForParticipant(uid, MatchStatus.ACTIVE);
  },

  /**
   * Updates a student's FCM token (called on app launch or token refresh).
   */
  async updateFcmToken(uid: string, token: string): Promise<void> {
    await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
      fcm_token: token,
      updated_at: FieldValue.serverTimestamp(),
    });
  },

  /**
   * Updates Firebase Auth custom claims for a student.
   * Call after verification status changes.
   */
  async syncAuthClaims(uid: string): Promise<void> {
    const student = await getStudent(uid);
    if (!student) return;

    const currentClaims = await adminAuth.getUser(uid).then((u) => u.customClaims || {});
    await adminAuth.setCustomUserClaims(uid, {
      ...currentClaims,
      college_id: student.college_id,
      verification_status: student.verification_status,
      role: (currentClaims as any).role || 'student',
    });
  },
};
