import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { requireModerator } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { Errors, handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import { ReportStatus } from '../../../../../shared/enums';

const schema = z.object({
  report_id: Schemas.docId,
  status: z.enum([ReportStatus.ACTION_TAKEN, ReportStatus.DISMISSED]),
  action_notes: z.string().trim().max(1000).optional(),
}).superRefine(({ status, action_notes }, context) => {
  if (status === ReportStatus.ACTION_TAKEN && !action_notes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['action_notes'],
      message: 'Action notes are required when action is taken.',
    });
  }
});

/** Reviews a pending safety report and records an immutable audit entry. */
export const reviewReport = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authContext = requireModerator(context);
      const { report_id, status, action_notes } = validate(schema, data);
      const reportRef = db.collection(COLLECTIONS.REPORTS).doc(report_id);

      await db.runTransaction(async (transaction) => {
        const reportDocument = await transaction.get(reportRef);
        if (!reportDocument.exists) throw Errors.notFound('Report');
        if (reportDocument.data()?.status !== ReportStatus.PENDING) {
          throw Errors.preconditionFailed('This report has already been reviewed.');
        }

        transaction.update(reportRef, {
          status,
          action_taken: action_notes ?? null,
          reviewed_by: authContext.uid,
          reviewed_at: FieldValue.serverTimestamp(),
        });
        transaction.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
          admin_id: authContext.uid,
          action: `report_${status}`,
          target_id: report_id,
          target_collection: COLLECTIONS.REPORTS,
          details: { action_notes: action_notes ?? null },
          created_at: FieldValue.serverTimestamp(),
        });
      });

      return { success: true, data: { report_id, status } };
    } catch (error) {
      handleUnknownError(error, 'reviewReport');
    }
  });
