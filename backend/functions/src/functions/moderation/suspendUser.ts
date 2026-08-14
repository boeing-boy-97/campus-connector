// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/suspendUser.ts — Moderator suspends a student account        ║
// ║                                                                          ║
// ║  This is the enforcement action behind a safety report. Suspension        ║
// ║  revokes refresh tokens, closes active matches, and blocks every          ║
// ║  `requireVerified` surface immediately.                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireModerator } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { StudentService } from '../../services/student.service';

const schema = z.object({
  student_id: Schemas.docId,
  reason: z.string().min(5).max(500).trim(),
});

export const suspendUser = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireModerator(context);
      const { student_id, reason } = validate(schema, data);

      if (student_id === authCtx.uid) {
        throw Errors.invalidArgument('You cannot suspend your own account.');
      }

      await StudentService.suspend(student_id, authCtx.uid, reason);

      return { success: true, data: { student_id, status: 'suspended' } };
    } catch (error) {
      handleUnknownError(error, 'suspendUser');
    }
  });
