// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  recommendations.ts — Discovery feed                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { MatchService } from '../../services/match.service';
import { MatchType, Gender } from '../../../../../shared/enums';

const schema = z.object({
  gender_filter: z.nativeEnum(Gender).optional(),
  year_filter: z.number().int().min(1).max(6).optional(),
  match_type: z.nativeEnum(MatchType).optional(),
  ...Schemas.pagination.shape,
});

export const getRecommendations = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      const { gender_filter, year_filter, match_type, page_size, last_doc_id } = validate(schema, data ?? {});

      const result = await MatchService.getRecommendations(authCtx.uid, authCtx.collegeId, {
        gender_filter,
        year_filter,
        match_type,
        page_size,
        last_doc_id,
      });

      return { success: true, data: result };
    } catch (error) {
      handleUnknownError(error, 'getRecommendations');
    }
  });
