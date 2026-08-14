// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  firestore.utils.ts — Typed Firestore helper functions                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as admin from 'firebase-admin';
import { db, FieldValue } from '../config/firebase';
import { COLLECTIONS } from '../../../../shared/constants';
import { Student, Match, College } from '../../../../shared/types';

/**
 * Typed document fetch — returns null if not found instead of throwing
 */
export async function getDoc<T>(
  collection: string,
  docId: string
): Promise<(T & { id: string }) | null> {
  const snap = await db.collection(collection).doc(docId).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as T), id: snap.id };
}

/**
 * Typed collection query helper
 */
export async function queryDocs<T>(
  collectionName: string,
  builder: (ref: admin.firestore.CollectionReference) => admin.firestore.Query
): Promise<(T & { id: string })[]> {
  const q = builder(db.collection(collectionName));
  const snap = await q.get();
  return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
}

/**
 * Gets a student by UID — returns null if not found
 */
export async function getStudent(uid: string): Promise<(Student & { id: string }) | null> {
  return getDoc<Student>(COLLECTIONS.STUDENTS, uid);
}

/**
 * Gets a college by ID — returns null if not found
 */
export async function getCollege(collegeId: string): Promise<(College & { id: string }) | null> {
  return getDoc<College>(COLLECTIONS.COLLEGES, collegeId);
}

/**
 * Checks if two users are blocked (in either direction)
 */
export async function areUsersBlocked(userA: string, userB: string): Promise<boolean> {
  const [snapA, snapB] = await Promise.all([
    db.collection(COLLECTIONS.BLOCKS).doc(`${userA}_${userB}`).get(),
    db.collection(COLLECTIONS.BLOCKS).doc(`${userB}_${userA}`).get(),
  ]);
  return snapA.exists || snapB.exists;
}

/**
 * Gets the set of user IDs that the given user has blocked or been blocked by
 */
export async function getBlockedUserIds(uid: string): Promise<Set<string>> {
  const [given, received] = await Promise.all([
    db.collection(COLLECTIONS.BLOCKS).where('blocker_id', '==', uid).get(),
    db.collection(COLLECTIONS.BLOCKS).where('blocked_id', '==', uid).get(),
  ]);
  const ids = new Set<string>();
  given.docs.forEach((d) => ids.add(d.data().blocked_id));
  received.docs.forEach((d) => ids.add(d.data().blocker_id));
  ids.add(uid); // always exclude self
  return ids;
}

/**
 * Writes an audit log entry
 */
export async function writeAuditLog(entry: {
  admin_id: string;
  action: string;
  target_id: string;
  target_collection: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db.collection(COLLECTIONS.AUDIT_LOGS).add({
    ...entry,
    created_at: FieldValue.serverTimestamp(),
  });
}

/**
 * Runs a batch operation safely — auto-splits into 500-write chunks
 */
export async function safeBatchWrite(
  operations: Array<{
    type: 'set' | 'update' | 'delete';
    ref: admin.firestore.DocumentReference;
    data?: Record<string, unknown>;
  }>
): Promise<void> {
  const BATCH_SIZE = 499;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = operations.slice(i, i + BATCH_SIZE);
    for (const op of chunk) {
      if (op.type === 'set') batch.set(op.ref, op.data!);
      else if (op.type === 'update') batch.update(op.ref, op.data!);
      else if (op.type === 'delete') batch.delete(op.ref);
    }
    await batch.commit();
  }
}

/**
 * Returns a server timestamp for a future point in time
 */
export function futureTimestamp(minutesFromNow: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesFromNow);
  return d;
}

/**
 * Strips private/sensitive fields from a student object before sending to clients
 */
export function toPublicStudentProfile(student: Student & { id: string }) {
  const {
    college_email,
    phone,
    uniform_verification_photo_url,
    fcm_token,
    consent_given_at,
    consent_version,
    last_seen,
    otp_hash,
    otp_expires_at,
    otp_attempt_count,
    deleted_at,
    deletion_reason,
    ...pub
  } = student as any;

  return pub;
}
