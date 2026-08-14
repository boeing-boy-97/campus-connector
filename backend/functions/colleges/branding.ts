// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  branding.ts — Get college dynamic branding config                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTIONS } from '../../../../shared/constants';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

export interface BrandingConfig {
  college_id: string;
  name: string;
  short_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
}

export const getCollegeBranding = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<BrandingConfig>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const collegeId = context.auth.token?.college_id;
    if (!collegeId) {
      throw new functions.https.HttpsError('not-found', 'College not linked to account.');
    }

    const collegeSnap = await db.collection(COLLECTIONS.COLLEGES).doc(collegeId).get();
    if (!collegeSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'College not found.');
    }

    const d = collegeSnap.data()!;
    return {
      success: true,
      data: {
        college_id: collegeSnap.id,
        name: d.name,
        short_name: d.short_name,
        logo_url: d.logo_url,
        primary_color: d.primary_color,
        secondary_color: d.secondary_color,
      },
    };
  });
