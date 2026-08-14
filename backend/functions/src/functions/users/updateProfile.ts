// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  updateProfile.ts — Update student profile fields                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError } from '../../utils/errors';
import { StudentService } from '../../services/student.service';
import { Student } from '../../../../../shared/types';

const updateProfileSchema = z.object({
  bio: z.string().min(10).max(500).trim().optional(),
  branch: z.string().min(2).max(100).trim().optional(),
  year: z.number().int().min(1).max(6).optional(),
  interests: z.array(z.string().min(1).max(50)).min(1).max(15).optional(),
  intent_flags: z.object({
    dating: z.boolean(),
    friendship: z.boolean(),
    study: z.boolean(),
    hackathon: z.boolean(),
    project: z.boolean(),
  })
    .refine(
      (flags) => Object.values(flags).some(Boolean),
      'Please keep at least one connection type enabled.'
    )
    .optional(),
  linkedin_url: z.union([Schemas.profileUrl('linkedin.com'), z.literal('')]).optional(),
  github_url: z.union([Schemas.profileUrl('github.com'), z.literal('')]).optional(),
  fcm_token: z.string().max(4096).optional(),
})
  // `profile_photos` is deliberately NOT accepted here: photos are Cloud Storage
  // objects owned by the caller and are committed through `updateProfilePhotos`,
  // which verifies ownership. Accepting free-form URLs would let a client inject
  // arbitrary remote images into the discovery feed.
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'At least one field must be provided.');

export const updateProfile = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      await RateLimits.updateProfile(authCtx.uid);
      const parsed = validate(updateProfileSchema, data);

      // An empty string clears an optional social link.
      const updates: Record<string, unknown> = { ...parsed };
      for (const field of ['linkedin_url', 'github_url'] as const) {
        if (updates[field] === '') updates[field] = null;
      }

      await StudentService.update(authCtx.uid, updates as Partial<Student>);
      return { success: true, data: { updated_fields: Object.keys(updates) } };
    } catch (error) {
      handleUnknownError(error, 'updateProfile');
    }
  });
