// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/reportUser.ts — Report a student profile or chat            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS, REPORT_LIMITS } from '../../../../../shared/constants';
import { ReportReason, ReportCategory, ReportStatus } from '../../../../../shared/enums';
import { createLogger } from '../../utils/logger';
import { getStudent } from '../../utils/firestore.utils';

const log = createLogger('reportUser');

const schema = z.object({
  reported_id: Schemas.docId,
  category: z.nativeEnum(ReportCategory),
  reason: z.nativeEnum(ReportReason),
  description: z.string().max(REPORT_LIMITS.MAX_DESCRIPTION_LENGTH).trim().optional(),
});

export const reportUser = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      await RateLimits.reportUser(authCtx.uid);
      const parsed = validate(schema, data);

      if (authCtx.uid === parsed.reported_id) {
        throw Errors.invalidArgument('You cannot report yourself.');
      }
      const reportedStudent = await getStudent(parsed.reported_id);
      if (!reportedStudent || reportedStudent.college_id !== authCtx.collegeId) {
        throw Errors.notFound('Student');
      }

      const docRef = await db.collection(COLLECTIONS.REPORTS).add({
        reporter_id: authCtx.uid,
        reported_id: parsed.reported_id,
        college_id: authCtx.collegeId,
        category: parsed.category,
        reason: parsed.reason,
        description: parsed.description || null,
        status: ReportStatus.PENDING,
        created_at: FieldValue.serverTimestamp(),
      });

      log.info(`Report submitted: ${docRef.id} (${authCtx.uid} → ${parsed.reported_id})`);

      return {
        success: true,
        data: { report_id: docRef.id },
      };
    } catch (error) {
      handleUnknownError(error, 'reportUser');
    }
  });
