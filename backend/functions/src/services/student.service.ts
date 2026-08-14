// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  student.service.ts — Student profile business logic                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { db, auth as adminAuth, FieldValue } from '../config/firebase';
import { getStudent, toPublicStudentProfile, writeAuditLog } from '../utils/firestore.utils';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { COLLECTIONS, BUSINESS_RULES } from '../../../../shared/constants';
import { VerificationStatus } from '../../../../shared/enums';
import { Student } from '../../../../shared/types';

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
   * Creates a new student profile.
   * Enforces 18+ age gate.
   */
  async create(uid: string, data: Partial<Student>): Promise<void> {
    // Age validation (18+)
    if (data.date_of_birth) {
      const dob = (data.date_of_birth as any).toDate
        ? (data.date_of_birth as any).toDate()
        : new Date(data.date_of_birth as any);
      const ageMs = Date.now() - dob.getTime();
      const agYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
      if (agYears < BUSINESS_RULES.MIN_AGE) {
        throw Errors.preconditionFailed(
          `You must be at least ${BUSINESS_RULES.MIN_AGE} years old to use Campus Connect.`
        );
      }
    }

    // Check if profile already exists
    const existing = await getStudent(uid);
    if (existing) {
      throw Errors.alreadyExists('Profile already exists. Use updateProfile to make changes.');
    }

    await db.collection(COLLECTIONS.STUDENTS).doc(uid).set({
      ...data,
      id: uid,
      verification_status: VerificationStatus.PENDING,
      is_active: true,
      is_profile_complete: false,
      profile_photos: [],
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    log.info(`Profile created for ${uid}`);
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

    // Deactivate all active matches
    const activeMatchesA = await db.collection(COLLECTIONS.MATCHES)
      .where('student_a_id', '==', uid)
      .where('status', '==', 'active')
      .get();
    const activeMatchesB = await db.collection(COLLECTIONS.MATCHES)
      .where('student_b_id', '==', uid)
      .where('status', '==', 'active')
      .get();

    [...activeMatchesA.docs, ...activeMatchesB.docs].forEach((d) => {
      batch.update(d.ref, { status: 'unmatched', updated_at: FieldValue.serverTimestamp() });
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
