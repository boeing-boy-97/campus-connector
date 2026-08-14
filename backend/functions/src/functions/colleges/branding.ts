// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  colleges/branding.ts — Public/authenticated college branding lookup     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { CollegeService } from '../../services/college.service';

const schema = z.object({
  college_id: Schemas.docId,
});

export const getCollegeBranding = functions
  .region('asia-south1')
  .runWith({ memory: '128MB', timeoutSeconds: 15 })
  .https.onCall(async (data, _context) => {
    try {
      const { college_id } = validate(schema, data);
      const branding = await CollegeService.getBranding(college_id);

      return {
        success: true,
        data: branding,
      };
    } catch (error) {
      handleUnknownError(error, 'getCollegeBranding');
    }
  });
