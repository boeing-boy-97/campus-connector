// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  getProfile.ts — Fetch own or another student's profile                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAuth, requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { StudentService } from '../../services/student.service';


const getProfileSchema = z.object({
  student_id: Schemas.docId.optional(), // If omitted, fetch own profile
});

export const getProfile = functions
  .region('asia-south1')
  .runWith({ memory: '128MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { student_id } = validate(getProfileSchema, data ?? {});

      if (!student_id || student_id === authCtx.uid) {
        // Fetch own full profile
        const profile = await StudentService.getOwnProfile(authCtx.uid);
        return { success: true, data: profile };
      }

      // Only verified students may access another student's public profile.
      requireVerified(context);
      const profile = await StudentService.getPublicProfile(
        student_id,
        authCtx.uid,
        authCtx.collegeId
      );

      return { success: true, data: profile };
    } catch (error) {
      handleUnknownError(error, 'getProfile');
    }
  });
