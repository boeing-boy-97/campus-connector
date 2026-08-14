// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  notifications/email.ts — Admin-triggered transactional e-mail            ║
// ║                                                                          ║
// ║  Used by campus administrators to re-send onboarding mail. Templates and  ║
// ║  SMTP transport live in utils/email.utils.ts so every outbound e-mail     ║
// ║  shares one implementation.                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { deliverEmail, EmailTemplates } from '../../utils/email.utils';
import { maskEmail } from '../../utils/otp.utils';
import { createLogger } from '../../utils/logger';
import { writeAuditLog } from '../../utils/firestore.utils';
import { COLLECTIONS } from '../../../../../shared/constants';

const log = createLogger('sendEmail');

const schema = z.object({
  to: Schemas.anyEmail,
  template: z.enum(['welcome', 'verification_approved']),
  params: z.object({
    name: z.string().min(1).max(100).trim(),
    college_name: z.string().min(1).max(150).trim(),
  }),
});

/**
 * Sends a transactional e-mail from an administrator.
 * OTP mail is deliberately NOT exposed here — codes are only ever generated and
 * sent by `sendOtp`, so no privileged caller can mint a code for an address.
 */
export const sendEmail = functions
  .region('asia-south1')
  .runWith({
    memory: '256MB',
    timeoutSeconds: 60,
    secrets: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
  })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAdmin(context);
      const { to, template, params } = validate(schema, data);

      const content = template === 'welcome'
        ? EmailTemplates.welcome(params.name, params.college_name)
        : EmailTemplates.verificationApproved(params.name, params.college_name);

      try {
        await deliverEmail(to, content);
      } catch (deliveryError) {
        log.error(`Failed to deliver '${template}' to ${maskEmail(to)}`, deliveryError);
        if (deliveryError instanceof functions.https.HttpsError) throw deliveryError;
        throw Errors.internal('The e-mail could not be delivered. Please try again later.');
      }

      await writeAuditLog({
        admin_id: authCtx.uid,
        action: 'send_email',
        target_id: to,
        target_collection: COLLECTIONS.STUDENTS,
        details: { template },
      });

      log.info(`Sent '${template}' e-mail to ${maskEmail(to)}`);
      return { success: true, data: { delivered: true, template } };
    } catch (error) {
      handleUnknownError(error, 'sendEmail');
    }
  });
