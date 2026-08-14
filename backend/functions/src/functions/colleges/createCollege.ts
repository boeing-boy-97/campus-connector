// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  colleges/createCollege.ts — Admin creates a new college                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { CollegeService } from '../../services/college.service';

const schema = z.object({
  name: z.string().min(3).max(150).trim(),
  short_name: z.string().min(2).max(50).trim(),
  domain: Schemas.domain,
  logo_url: Schemas.url,
  primary_color: Schemas.hexColor,
  secondary_color: Schemas.hexColor,
  city: z.string().min(2).max(100).trim(),
  state: z.string().min(2).max(100).trim(),
  student_count: z.number().int().min(0).optional(),
});

export const createCollege = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAdmin(context);
      const parsed = validate(schema, data);

      const collegeId = await CollegeService.create(parsed, authCtx.uid);

      return {
        success: true,
        data: { college_id: collegeId },
      };
    } catch (error) {
      handleUnknownError(error, 'createCollege');
    }
  });
