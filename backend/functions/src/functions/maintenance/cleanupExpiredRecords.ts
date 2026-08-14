// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  maintenance/cleanupExpiredRecords.ts — Scheduled housekeeping            ║
// ║                                                                          ║
// ║  `otp_records` and `rate_limits` are write-heavy, short-lived collections. ║
// ║  Abandoned OTPs (requested but never verified) and stale rate-limit        ║
// ║  buckets would otherwise accumulate forever — unbounded cost and, for      ║
// ║  OTP records, unnecessary retention of e-mail addresses.                  ║
// ║                                                                          ║
// ║  Firestore TTL policies are also declared in firestore.indexes.json; this  ║
// ║  job is the belt-and-braces path (TTL deletion is best-effort and can lag  ║
// ║  by up to 24 h) and it also expires stale pending connect requests.        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { db, FieldValue } from '../../config/firebase';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS } from '../../../../../shared/constants';
import { ConnectRequestStatus } from '../../../../../shared/enums';

const log = createLogger('cleanupExpiredRecords');

const BATCH_LIMIT = 400;
/** Pending connect requests older than this are marked expired. */
const CONNECT_REQUEST_TTL_DAYS = 30;

/** Deletes up to `BATCH_LIMIT` documents matched by a query. */
async function deleteBatch(query: FirebaseFirestore.Query): Promise<number> {
  const snapshot = await query.limit(BATCH_LIMIT).get();
  if (snapshot.empty) return 0;

  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
}

/** Repeatedly deletes matching documents until the collection is drained. */
async function drain(query: FirebaseFirestore.Query, label: string): Promise<number> {
  let total = 0;
  for (let pass = 0; pass < 25; pass += 1) {
    const deleted = await deleteBatch(query);
    total += deleted;
    if (deleted < BATCH_LIMIT) break;
  }
  if (total > 0) log.info(`Deleted ${total} expired ${label} document(s)`);
  return total;
}

export async function runCleanup(now = new Date()): Promise<{
  otp_records: number;
  rate_limits: number;
  connect_requests: number;
}> {
  // Expired one-time passcodes — never useful again once past `expires_at`.
  const otpDeleted = await drain(
    db.collection(COLLECTIONS.OTP_RECORDS).where('expires_at', '<', now),
    'otp_records'
  );

  // Rate-limit buckets whose window has closed.
  const rateLimitDeleted = await drain(
    db.collection(COLLECTIONS.RATE_LIMITS).where('expires_at', '<', now),
    'rate_limits'
  );

  // Stale pending connect requests: expire rather than delete, so the pair can
  // reconnect later while the historical record is preserved.
  const cutoff = new Date(now.getTime() - CONNECT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  const staleRequests = await db.collection(COLLECTIONS.CONNECT_REQUESTS)
    .where('status', '==', ConnectRequestStatus.PENDING)
    .where('created_at', '<', cutoff)
    .limit(BATCH_LIMIT)
    .get();

  if (!staleRequests.empty) {
    const batch = db.batch();
    staleRequests.docs.forEach((document) => batch.update(document.ref, {
      status: ConnectRequestStatus.EXPIRED,
      responded_at: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    log.info(`Expired ${staleRequests.size} stale connect request(s)`);
  }

  return {
    otp_records: otpDeleted,
    rate_limits: rateLimitDeleted,
    connect_requests: staleRequests.size,
  };
}

export const cleanupExpiredRecords = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 540 })
  .pubsub.schedule('every 6 hours')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    try {
      const result = await runCleanup();
      log.info('Cleanup complete', result);
    } catch (error) {
      // A scheduled job must never crash-loop the deployment; log and let the
      // next run retry.
      log.error('Cleanup failed', error);
    }
    return null;
  });
