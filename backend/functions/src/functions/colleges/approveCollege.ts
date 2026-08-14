// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  colleges/approveCollege.ts — Admin approves or rejects a college        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { CollegeService } from '../../services/college.service';

const schema = z.object({
  college_id: Schemas.docId,
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).trim().optional(),
});

export const approveCollege = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAdmin(context);
      const { college_id, action, reason } = validate(schema, data);

      await CollegeService.changeStatus(college_id, action, authCtx.uid, reason);

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'approveCollege');
    }
  });
