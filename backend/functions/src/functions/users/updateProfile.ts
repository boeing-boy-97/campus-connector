// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  updateProfile.ts — Update student profile fields                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError } from '../../utils/errors';
import { StudentService } from '../../services/student.service';

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
  }).optional(),
  profile_photos: z.array(z.string().url()).max(6).optional(),
  fcm_token: z.string().optional(),
}).refine((d) => Object.keys(d).length > 0, 'At least one field must be provided.');

export const updateProfile = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      await RateLimits.updateProfile(authCtx.uid);
      const updates = validate(updateProfileSchema, data);
      await StudentService.update(authCtx.uid, updates as any);
      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'updateProfile');
    }
  });
