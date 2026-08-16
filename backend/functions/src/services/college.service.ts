// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  college.service.ts — College business logic                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { db, FieldValue } from '../config/firebase';
import { getDoc, getCollege, writeAuditLog } from '../utils/firestore.utils';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { COLLECTIONS } from '../../../../shared/constants';
import { CollegeVerifiedStatus } from '../../../../shared/enums';
import { College } from '../../../../shared/types';

const log = createLogger('college.service');

export interface CreateCollegeInput {
  name: string;
  short_name: string;
  domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  city: string;
  state: string;
  student_count?: number;
}

export const CollegeService = {

  /**
   * Looks up a college by email domain.
   * Returns null if no approved college matches.
   * In testing mode (ALLOW_ANY_EMAIL_DOMAIN=true), returns a synthetic fallback
   * college so any email can sign up. This is intentionally NOT default for prod.
   */
  async getByDomain(email: string): Promise<(College & { id: string }) | null> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    const snap = await db.collection(COLLECTIONS.COLLEGES)
      .where('domain', '==', domain)
      .where('verified_status', '==', CollegeVerifiedStatus.APPROVED)
      .limit(1)
      .get();

    if (!snap.empty) {
      return { ...(snap.docs[0].data() as College), id: snap.docs[0].id };
    }

    // Testing mode: allow any email domain (user requested "allow_all" for testing)
    // Set via Cloud Functions env vars: ALLOW_ANY_EMAIL_DOMAIN=true
    // NEVER enable in production unless you intentionally want open signup.
    if (process.env.ALLOW_ANY_EMAIL_DOMAIN === 'true') {
      log.warn(`[TEST MODE] No approved college for domain ${domain} — using synthetic fallback because ALLOW_ANY_EMAIL_DOMAIN=true`);
      // Try to find or create a generic test college doc for this domain
      const fallbackId = `test_${domain.replace(/[^a-z0-9]/g, '_')}`;
      const fallbackRef = db.collection(COLLECTIONS.COLLEGES).doc(fallbackId);
      const existing = await fallbackRef.get();
      if (!existing.exists) {
        // Create a minimal approved college for this domain on-the-fly
        await fallbackRef.set({
          name: `${domain.split('.')[0]} Campus (Test)`,
          short_name: domain.split('.')[0].slice(0, 6).toUpperCase(),
          domain,
          logo_url: '',
          primary_color: '#244c43',
          secondary_color: '#d8ee6c',
          city: 'Test City',
          state: 'Test State',
          verified_status: CollegeVerifiedStatus.APPROVED,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
          is_test_college: true,
        });
        log.info(`Created test college ${fallbackId} for domain ${domain}`);
      }
      const data = (await fallbackRef.get()).data() as College;
      return { ...data, id: fallbackId };
    }

    return null;
  },

  /**
   * Creates a new college (admin only).
   */
  async create(data: CreateCollegeInput, adminId: string): Promise<string> {
    // Domain uniqueness check
    const existing = await db.collection(COLLECTIONS.COLLEGES)
      .where('domain', '==', data.domain)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw Errors.alreadyExists(`Domain '${data.domain}' is already registered.`);
    }

    const docRef = await db.collection(COLLECTIONS.COLLEGES).add({
      ...data,
      verified_status: CollegeVerifiedStatus.PENDING,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      admin_id: adminId,
      action: 'create_college',
      target_id: docRef.id,
      target_collection: COLLECTIONS.COLLEGES,
      details: { domain: data.domain, name: data.name },
    });

    log.info(`College created: ${docRef.id} (${data.domain})`);
    return docRef.id;
  },

  /**
   * Approves or rejects a college.
   */
  async changeStatus(
    collegeId: string,
    action: 'approve' | 'reject',
    adminId: string,
    reason?: string
  ): Promise<void> {
    const college = await getCollege(collegeId);
    if (!college) throw Errors.notFound('College');

    const newStatus = action === 'approve'
      ? CollegeVerifiedStatus.APPROVED
      : CollegeVerifiedStatus.REJECTED;

    await db.collection(COLLECTIONS.COLLEGES).doc(collegeId).update({
      verified_status: newStatus,
      approved_at: FieldValue.serverTimestamp(),
      approved_by: adminId,
      rejection_reason: reason || null,
      updated_at: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      admin_id: adminId,
      action: `${action}_college`,
      target_id: collegeId,
      target_collection: COLLECTIONS.COLLEGES,
      details: { reason },
    });

    log.info(`College ${collegeId} ${action}d by admin ${adminId}`);
  },

  /**
   * Returns branding config for a college.
   */
  async getBranding(collegeId: string) {
    const college = await getCollege(collegeId);
    if (!college) throw Errors.notFound('College');

    return {
      college_id: college.id,
      name: college.name,
      short_name: college.short_name,
      logo_url: college.logo_url,
      primary_color: college.primary_color,
      secondary_color: college.secondary_color,
    };
  },
};
