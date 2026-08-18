import * as functions from 'firebase-functions';
import { z } from 'zod';
import { auth as adminAuth } from '../../config/firebase';
import { requireAdmin } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { Errors, handleUnknownError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const log = createLogger('updateUserRole');

const schema = z.object({
  uid: Schemas.docId,
  role: z.enum(['student', 'moderator', 'admin']),
});

export const updateUserRole = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAdmin(context);
      const { uid, role } = validate(schema, data);

      if (uid === authCtx.uid && role !== 'admin') {
        throw Errors.forbidden('You cannot demote your own admin account from the dashboard.');
      }

      if (role === 'admin' && authCtx.role !== 'admin') {
        throw Errors.forbidden('Only a super-admin can grant admin access.');
      }

      const user = await adminAuth.getUser(uid);
      const currentClaims = user.customClaims || {};

      await adminAuth.setCustomUserClaims(uid, {
        ...currentClaims,
        role,
      });

      log.info(`Role updated for ${uid} to ${role} by ${authCtx.uid}`);

      return {
        success: true,
        data: { uid, role },
      };
    } catch (error) {
      handleUnknownError(error, 'updateUserRole');
    }
  });
