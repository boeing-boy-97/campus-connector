// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/reportUser.ts — Report a student profile or chat            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS, REPORT_LIMITS } from '../../../../../shared/constants';
import { ReportReason, ReportCategory, ReportStatus } from '../../../../../shared/enums';
import { createLogger } from '../../utils/logger';

const log = createLogger('reportUser');

const schema = z.object({
  reported_id: Schemas.docId,
  category: z.nativeEnum(ReportCategory),
  reason: z.nativeEnum(ReportReason),
  description: z.string().max(REPORT_LIMITS.MAX_DESCRIPTION_LENGTH).trim().optional(),
  evidence_photos: z.array(z.string().url()).max(REPORT_LIMITS.MAX_EVIDENCE_PHOTOS).optional(),
});

export const reportUser = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      await RateLimits.reportUser(authCtx.uid);
      const parsed = validate(schema, data);

      if (authCtx.uid === parsed.reported_id) {
        throw Errors.invalidArgument('You cannot report yourself.');
      }

      const docRef = await db.collection(COLLECTIONS.REPORTS).add({
        reporter_id: authCtx.uid,
        reported_id: parsed.reported_id,
        college_id: authCtx.collegeId,
        category: parsed.category,
        reason: parsed.reason,
        description: parsed.description || null,
        evidence_photos: parsed.evidence_photos || [],
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
