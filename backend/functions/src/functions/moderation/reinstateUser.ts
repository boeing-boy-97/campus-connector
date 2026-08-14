// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/reinstateUser.ts — Moderator lifts a suspension              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireModerator } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { StudentService } from '../../services/student.service';

const schema = z.object({
  student_id: Schemas.docId,
  notes: z.string().max(500).trim().optional(),
});

export const reinstateUser = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireModerator(context);
      const { student_id, notes } = validate(schema, data);

      await StudentService.reinstate(student_id, authCtx.uid, notes);

      return { success: true, data: { student_id, status: 'reinstated' } };
    } catch (error) {
      handleUnknownError(error, 'reinstateUser');
    }
  });
