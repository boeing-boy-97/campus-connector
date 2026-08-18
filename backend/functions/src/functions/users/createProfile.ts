// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  createProfile.ts — Student profile creation                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db, FieldValue, Timestamp } from '../../config/firebase';
import { requireCollegeLinked } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS, BUSINESS_RULES } from '../../../../../shared/constants';
import { Gender, MatchType, VerificationStatus } from '../../../../../shared/enums';
import { StudentService } from '../../services/student.service';

const log = createLogger('createProfile');

const createProfileSchema = z.object({
  full_name: z.string().min(2).max(60).trim()
    .regex(/^[a-zA-Z\s.'-]+$/, 'Name can only contain letters, spaces, and basic punctuation'),
  date_of_birth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  gender: z.nativeEnum(Gender),
  bio: z.string().min(10).max(500).trim(),
  branch: z.string().min(2).max(100).trim(),
  year: z.number().int().min(1).max(6),
  interests: z.array(z.string().min(1).max(50)).min(1).max(15),
  intent_flags: z.object({
    dating: z.boolean(),
    friendship: z.boolean(),
    study: z.boolean(),
    hackathon: z.boolean(),
    project: z.boolean(),
  }).refine(
    (flags) => Object.values(flags).some(Boolean),
    'Please select at least one connection type.'
  ),
  consent_given: z.boolean().refine((v) => v === true, 'You must provide consent.'),
  consent_version: z.string().default('1.0.0'),
  fcm_token: z.string().optional(),
});

function parseDateOfBirth(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw Errors.invalidArgument('Invalid date of birth.');
  }

  return date;
}

export const createProfile = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireCollegeLinked(context);
      const parsed = validate(createProfileSchema, data);

      // Age validation (18+)
      const dob = parseDateOfBirth(parsed.date_of_birth);
      const today = new Date();
      const hasHadBirthdayThisYear =
        today.getUTCMonth() > dob.getUTCMonth() ||
        (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate());
      const age = today.getUTCFullYear() - dob.getUTCFullYear() - (hasHadBirthdayThisYear ? 0 : 1);

      if (age < BUSINESS_RULES.MIN_AGE) {
        throw Errors.preconditionFailed(
          `You must be at least ${BUSINESS_RULES.MIN_AGE} years old to use Campus Connect.`
        );
      }

      // Check if profile already exists
      const existing = await db.collection(COLLECTIONS.STUDENTS).doc(authCtx.uid).get();
      if (existing.exists) {
        throw Errors.alreadyExists('Profile already exists. Use updateProfile to make changes.');
      }

      await db.collection(COLLECTIONS.STUDENTS).doc(authCtx.uid).set({
        id: authCtx.uid,
        college_id: authCtx.collegeId,
        college_email: authCtx.email,
        full_name: parsed.full_name,
        date_of_birth: Timestamp.fromDate(dob),
        gender: parsed.gender,
        bio: parsed.bio,
        branch: parsed.branch,
        year: parsed.year,
        interests: parsed.interests,
        intent_flags: parsed.intent_flags,
        profile_photos: [],
        verification_status: VerificationStatus.PENDING,
        is_active: true,
        is_profile_complete: false, // True after photo verification
        fcm_token: parsed.fcm_token || null,
        consent_given_at: FieldValue.serverTimestamp(),
        consent_version: parsed.consent_version,
        last_seen: FieldValue.serverTimestamp(),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      log.info(`Profile created for ${authCtx.uid} (${authCtx.email})`);

      return {
        success: true,
        data: {
          uid: authCtx.uid,
          next_step: 'upload_verification_photo',
        },
      };
    } catch (error) {
      handleUnknownError(error, 'createProfile');
    }
  });
