// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  login.ts — Session refresh on app launch                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { db, FieldValue } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS } from '../../../../../shared/constants';
import { StudentService } from '../../services/student.service';
import { CollegeService } from '../../services/college.service';
import { VerificationStatus } from '../../../../../shared/enums';

const log = createLogger('login');

export const login = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);

      const student = await db.collection(COLLECTIONS.STUDENTS).doc(authCtx.uid).get();

      // Update last seen
      if (student.exists) {
        await db.collection(COLLECTIONS.STUDENTS).doc(authCtx.uid).update({
          last_seen: FieldValue.serverTimestamp(),
        });
      }

      // Sync claims if they're missing or stale
      if (!authCtx.collegeId && student.exists) {
        await StudentService.syncAuthClaims(authCtx.uid);
      }

      // Get college branding if available
      let branding = null;
      if (authCtx.collegeId) {
        try {
          branding = await CollegeService.getBranding(authCtx.collegeId);
        } catch { /* Graceful fail */ }
      }

      return {
        success: true,
        data: {
          uid: authCtx.uid,
          has_profile: student.exists,
          verification_status: authCtx.verificationStatus,
          college_id: authCtx.collegeId,
          branding,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'login');
    }
  });
