// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  colleges/domainCheck.ts — Lookup college branding by email domain      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { CollegeService } from '../../services/college.service';

const schema = z.object({
  email: Schemas.anyEmail,
});

export const checkEmailDomain = functions
  .region('asia-south1')
  .runWith({ memory: '128MB', timeoutSeconds: 15 })
  .https.onCall(async (data, context) => {
    try {
      const { email } = validate(schema, data);
      const college = await CollegeService.getByDomain(email);

      if (!college) {
        return {
          success: true,
          data: { is_registered: false, college: null },
        };
      }

      return {
        success: true,
        data: {
          is_registered: true,
          college: {
            college_id: college.id,
            name: college.name,
            short_name: college.short_name,
            logo_url: college.logo_url,
            primary_color: college.primary_color,
            secondary_color: college.secondary_color,
          },
        },
      };
    } catch (error) {
      handleUnknownError(error, 'checkEmailDomain');
    }
  });
