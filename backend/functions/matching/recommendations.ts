// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  recommendations.ts — Discovery feed (same-college, verified only)      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, PAGINATION, ERROR_CODES } from '../../../../shared/constants';
import { VerificationStatus, Gender, MatchType } from '../../../../shared/enums';
import { ApiResponse, Student, StudentPublicProfile } from '../../../../shared/types';

const db = admin.firestore();

const recommendationsSchema = z.object({
  match_type: z.nativeEnum(MatchType).optional(),
  gender_filter: z.nativeEnum(Gender).optional(),
  year_filter: z.number().int().min(1).max(4).optional(),
  page_size: z.number().int().min(1).max(50).default(PAGINATION.DISCOVERY_PAGE_SIZE),
  last_doc_id: z.string().optional(), // for cursor-based pagination
});

export const getRecommendations = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ profiles: StudentPublicProfile[]; has_more: boolean }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;
    const collegeId = context.auth.token?.college_id;

    if (!collegeId) {
      throw new functions.https.HttpsError('failed-precondition', 'College not linked.');
    }

    // Must be verified to browse
    if (context.auth.token?.verification_status !== VerificationStatus.APPROVED) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Your profile must be verified before you can browse.',
        { code: ERROR_CODES.NOT_VERIFIED }
      );
    }

    try {
      const parsed = recommendationsSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { gender_filter, year_filter, page_size, last_doc_id } = parsed.data;

      // 1. Get all users the current student has blocked or been blocked by
      const [blocksGiven, blocksReceived] = await Promise.all([
        db.collection(COLLECTIONS.BLOCKS).where('blocker_id', '==', uid).get(),
        db.collection(COLLECTIONS.BLOCKS).where('blocked_id', '==', uid).get(),
      ]);
      const blockedIds = new Set([
        ...blocksGiven.docs.map((d) => d.data().blocked_id),
        ...blocksReceived.docs.map((d) => d.data().blocker_id),
        uid, // exclude self
      ]);

      // 2. Build query — MUST filter by college_id
      let query: admin.firestore.Query = db.collection(COLLECTIONS.STUDENTS)
        .where('college_id', '==', collegeId)
        .where('verification_status', '==', VerificationStatus.APPROVED)
        .where('is_active', '==', true)
        .where('is_profile_complete', '==', true);

      if (gender_filter) query = query.where('gender', '==', gender_filter);
      if (year_filter) query = query.where('year', '==', year_filter);

      // Cursor pagination
      if (last_doc_id) {
        const lastDocSnap = await db.collection(COLLECTIONS.STUDENTS).doc(last_doc_id).get();
        if (lastDocSnap.exists) {
          query = query.startAfter(lastDocSnap);
        }
      }

      query = query.limit(page_size + 1); // fetch one extra to check has_more

      const snap = await query.get();
      const docs = snap.docs.slice(0, page_size);
      const hasMore = snap.docs.length > page_size;

      // 3. Filter out blocked users and strip private fields
      const profiles: StudentPublicProfile[] = docs
        .filter((d) => !blockedIds.has(d.id))
        .map((d) => {
          const s = d.data() as Student;
          const {
            college_email, phone, uniform_verification_photo_url,
            fcm_token, consent_given_at, consent_version, last_seen,
            ...pub
          } = s;
          return { id: d.id, ...pub } as StudentPublicProfile;
        });

      return { success: true, data: { profiles, has_more: hasMore } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('getRecommendations error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to load recommendations');
    }
  });
