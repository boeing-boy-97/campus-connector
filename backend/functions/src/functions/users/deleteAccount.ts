// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  deleteAccount.ts — DPDP Act 2023 compliant account deletion            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { StudentService } from '../../services/student.service';

const deleteAccountSchema = z.object({
  reason: z.enum(['not_useful', 'privacy_concerns', 'found_partner', 'other']).optional(),
  feedback: z.string().max(500).trim().optional(),
  confirmation: z.literal('DELETE MY ACCOUNT'),
});

export const deleteAccount = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { reason, feedback } = validate(deleteAccountSchema, data);

      await StudentService.deleteAccount(
        authCtx.uid,
        [reason, feedback].filter(Boolean).join(' | ')
      );

      return {
        success: true,
        data: { message: 'Your account has been deleted. We\'re sorry to see you go.' },
      };
    } catch (error) {
      handleUnknownError(error, 'deleteAccount');
    }
  });
