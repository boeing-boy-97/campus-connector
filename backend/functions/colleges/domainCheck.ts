// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  domainCheck.ts — Check if email domain is a registered college         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const domainCheckSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
});

export const checkEmailDomain = functions
  .region('asia-south1')
  .https.onCall(async (data): Promise<ApiResponse<{
    is_valid: boolean;
    college_id?: string;
    college_name?: string;
    college_short_name?: string;
  }>> => {
    const parsed = domainCheckSchema.safeParse(data);
    if (!parsed.success) {
      return { success: true, data: { is_valid: false } };
    }

    const domain = parsed.data.email.split('@')[1];

    const snap = await db.collection(COLLECTIONS.COLLEGES)
      .where('domain', '==', domain)
      .where('verified_status', '==', 'approved')
      .limit(1)
      .get();

    if (snap.empty) {
      return { success: true, data: { is_valid: false } };
    }

    const college = snap.docs[0];
    return {
      success: true,
      data: {
        is_valid: true,
        college_id: college.id,
        college_name: college.data().name,
        college_short_name: college.data().short_name,
      },
    };
  });
