import * as functions from 'firebase-functions/v1';
import { db, storage } from '../../config/firebase';
import { requireModerator } from '../../middleware/auth.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';

const SIGNED_URL_LIFETIME_MS = 15 * 60 * 1000;
const QUEUE_LIMIT = 50;

function formatTimestamp(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('toDate' in value)) return null;
  const toDate = (value as { toDate: () => Date }).toDate;
  return toDate.call(value).toISOString();
}

/**
 * Returns the pending verification queue to authorized reviewers. Private
 * verification photos are exposed through short-lived signed URLs only.
 */
export const getVerificationQueue = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (_data, context) => {
    try {
      requireModerator(context);

      const requestSnapshot = await db
        .collection(COLLECTIONS.VERIFICATION_REQUESTS)
        .where('review_status', '==', 'pending')
        .orderBy('submitted_at', 'asc')
        .limit(QUEUE_LIMIT)
        .get();

      const items = await Promise.all(
        requestSnapshot.docs.map(async (requestDocument) => {
          const request = requestDocument.data();
          const [studentDocument, collegeDocument, signedUrls] = await Promise.all([
            db.collection(COLLECTIONS.STUDENTS).doc(request.student_id).get(),
            db.collection(COLLECTIONS.COLLEGES).doc(request.college_id).get(),
            storage.bucket().file(request.storage_path).getSignedUrl({
              action: 'read',
              expires: Date.now() + SIGNED_URL_LIFETIME_MS,
            }),
          ]);

          const student = studentDocument.data() ?? {};
          const college = collegeDocument.data() ?? {};

          return {
            id: requestDocument.id,
            student_id: request.student_id,
            verification_photo_url: signedUrls[0],
            name: student.full_name ?? 'Unknown student',
            college_email: student.college_email ?? '',
            college_name: college.name ?? 'Unknown college',
            branch: student.branch ?? null,
            year: student.year ?? null,
            gender: student.gender ?? null,
            date_of_birth: formatTimestamp(student.date_of_birth),
            intent_flags: student.intent_flags ?? null,
            profile_photos: Array.isArray(student.profile_photos) ? student.profile_photos : [],
            submitted_at: formatTimestamp(request.submitted_at),
          };
        })
      );

      return { success: true, data: { items } };
    } catch (error) {
      handleUnknownError(error, 'getVerificationQueue');
    }
  });
