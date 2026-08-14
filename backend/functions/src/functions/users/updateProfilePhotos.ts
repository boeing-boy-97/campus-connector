// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  users/updateProfilePhotos.ts — Set the student's profile photo gallery   ║
// ║                                                                          ║
// ║  Clients upload directly to `profile_photos/{uid}/…` (Storage rules       ║
// ║  enforce ownership, size and content type) and then commit the ordered    ║
// ║  list of paths here. Only owned, existing Storage objects are accepted —  ║
// ║  arbitrary URLs can never enter the discovery feed.                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError } from '../../utils/errors';
import { StudentService } from '../../services/student.service';
import { PROFILE_LIMITS } from '../../../../../shared/constants';

const schema = z.object({
  storage_paths: z
    .array(
      z.string()
        .min(1)
        .max(512)
        .regex(/^profile_photos\/[^/]+\/[^/]+$/, 'Invalid profile photo path')
    )
    .max(PROFILE_LIMITS.MAX_PROFILE_PHOTOS),
});

export const updateProfilePhotos = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      await RateLimits.updateProfile(authCtx.uid);
      const { storage_paths } = validate(schema, data);

      const photos = await StudentService.setProfilePhotos(authCtx.uid, storage_paths);

      return { success: true, data: { profile_photos: photos } };
    } catch (error) {
      handleUnknownError(error, 'updateProfilePhotos');
    }
  });
