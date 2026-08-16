import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db, FieldValue, storage } from '../../config/firebase';
import { requireCollegeLinked } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';

const schema = z.object({
  storage_path: z
    .string()
    .regex(
      /^verification_photos\/[^/]+\/[^/]+$/,
      'Invalid verification photo path'
    ),
});

/**
 * Records the private uniform/ID photo after Storage has accepted the upload.
 * The path is bound to the signed-in user, so a client cannot submit another student's photo.
 */
export const submitVerificationPhoto = functions
  .region('asia-south1')
  .runWith({
    memory: '256MB',
    timeoutSeconds: 30,
  })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireCollegeLinked(context);

      const { storage_path } = validate(schema, data);

      if (
        !storage_path.startsWith(
          `verification_photos/${authCtx.uid}/`
        )
      ) {
        throw Errors.forbidden(
          'Verification photo must belong to your account.'
        );
      }

      const photo = storage.bucket().file(storage_path);
      const [exists] = await photo.exists();
      if (!exists) {
        throw Errors.notFound('Verification photo');
      }

      const [metadata] = await photo.getMetadata();
      const contentType = metadata.contentType || '';
      const size = Number(metadata.size || 0);
      if (!/^image\/(jpeg|png|webp)$/.test(contentType) || !Number.isFinite(size) || size < 1 || size >= 8 * 1024 * 1024) {
        throw Errors.invalidArgument('Verification photo must be a JPEG, PNG, or WebP image under 8 MB.');
      }

      const studentRef = db
        .collection(COLLECTIONS.STUDENTS)
        .doc(authCtx.uid);

      const studentDoc = await studentRef.get();

      if (!studentDoc.exists) {
        throw Errors.notFound('Profile');
      }

      await studentRef.update({
        verification_photo_path: storage_path,
        verification_submitted_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        data: {
          status: 'pending_review',
        },
      };
    } catch (error) {
      return handleUnknownError(
        error,
        'submitVerificationPhoto'
      );
    }
  });
