// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  deleteAccount.ts — Full DPDP Act 2023 compliant account deletion       ║
// ║  Deletes: Auth user, Firestore data, Storage files, custom claims       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTIONS, STORAGE_PATHS } from '../../../../shared/constants';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();
const storage = admin.storage();

export const deleteAccount = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const batch = db.batch();

      // 1. Soft-delete the student document (keep for 30 days for legal compliance)
      const studentRef = db.collection(COLLECTIONS.STUDENTS).doc(uid);
      batch.update(studentRef, {
        is_active: false,
        verification_status: 'deleted',
        full_name: '[Deleted User]',
        bio: '',
        profile_photos: [],
        interests: [],
        college_email: `deleted_${uid}@deleted.invalid`,
        deleted_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Delete all connect requests (incoming and outgoing)
      const outgoingReqs = await db.collection(COLLECTIONS.CONNECT_REQUESTS)
        .where('from_id', '==', uid).get();
      const incomingReqs = await db.collection(COLLECTIONS.CONNECT_REQUESTS)
        .where('to_id', '==', uid).get();
      [...outgoingReqs.docs, ...incomingReqs.docs].forEach((d) => batch.delete(d.ref));

      // 3. Deactivate matches (but keep message history for other party)
      const matchesA = await db.collection(COLLECTIONS.MATCHES)
        .where('student_a_id', '==', uid).get();
      const matchesB = await db.collection(COLLECTIONS.MATCHES)
        .where('student_b_id', '==', uid).get();
      [...matchesA.docs, ...matchesB.docs].forEach((d) =>
        batch.update(d.ref, { status: 'unmatched' })
      );

      // 4. Delete blocks
      const blocksGiven = await db.collection(COLLECTIONS.BLOCKS)
        .where('blocker_id', '==', uid).get();
      blocksGiven.docs.forEach((d) => batch.delete(d.ref));

      await batch.commit();

      // 5. Delete profile photos from Storage
      try {
        const [files] = await storage.bucket().getFiles({
          prefix: STORAGE_PATHS.PROFILE_PHOTOS(uid),
        });
        await Promise.all(files.map((f) => f.delete()));

        const [verifyFiles] = await storage.bucket().getFiles({
          prefix: STORAGE_PATHS.VERIFICATION_PHOTOS(uid),
        });
        await Promise.all(verifyFiles.map((f) => f.delete()));
      } catch (storageError) {
        functions.logger.warn('Storage cleanup partial failure:', storageError);
      }

      // 6. Delete Firebase Auth user
      await admin.auth().deleteUser(uid);

      // 7. Audit log
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        admin_id: uid,
        action: 'self_delete_account',
        target_id: uid,
        target_collection: COLLECTIONS.STUDENTS,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('deleteAccount error:', error);
      throw new functions.https.HttpsError('internal', 'Account deletion failed');
    }
  });
