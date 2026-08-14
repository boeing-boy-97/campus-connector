// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  createCollege.ts — Admin: register a new college                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { CollegeVerifiedStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const createCollegeSchema = z.object({
  name: z.string().min(3).max(200).trim(),
  short_name: z.string().min(2).max(50).trim(),
  domain: z.string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/, 'Invalid domain')
    .transform((d) => d.toLowerCase()),
  logo_url: z.string().url(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  city: z.string().min(2).max(100).trim(),
  state: z.string().min(2).max(100).trim(),
  student_count: z.number().int().min(0).optional(),
});

export const createCollege = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ college_id: string }>> => {
    // Admin only
    if (!context.auth || context.auth.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    try {
      const parsed = createCollegeSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      // Check domain uniqueness
      const existing = await db.collection(COLLECTIONS.COLLEGES)
        .where('domain', '==', parsed.data.domain).get();
      if (!existing.empty) {
        throw new functions.https.HttpsError('already-exists', `Domain '${parsed.data.domain}' is already registered.`);
      }

      const docRef = await db.collection(COLLECTIONS.COLLEGES).add({
        ...parsed.data,
        verified_status: CollegeVerifiedStatus.PENDING,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Audit log
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        admin_id: context.auth.uid,
        action: 'create_college',
        target_id: docRef.id,
        target_collection: COLLECTIONS.COLLEGES,
        details: { domain: parsed.data.domain, name: parsed.data.name },
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, data: { college_id: docRef.id } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('createCollege error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to create college');
    }
  });
