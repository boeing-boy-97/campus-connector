// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  firestore.utils.ts — Typed Firestore helper functions                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import type { CollectionReference, DocumentReference, Query } from 'firebase-admin/firestore';
import { db, FieldValue } from '../config/firebase';
import { COLLECTIONS } from '../../../../shared/constants';
import { Student, College, StudentPublicProfile } from '../../../../shared/types';
import { createHash } from 'node:crypto';

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
  builder: (ref: CollectionReference) => Query
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

/** Stable Firestore ID for an unordered pair without delimiter collisions. */
export function participantPairDocumentId(studentA: string, studentB: string): string {
  return createHash('sha256')
    .update(JSON.stringify([studentA, studentB].sort()))
    .digest('hex');
}

/** Stable, path-safe identifier for a directional block relationship. */
export function blockDocumentId(blockerId: string, blockedId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([blockerId, blockedId]))
    .digest('hex');
}

/** Checks whether either user has blocked the other, including legacy IDs. */
export async function areUsersBlocked(userA: string, userB: string): Promise<boolean> {
  const blockCollection = db.collection(COLLECTIONS.BLOCKS);
  const documentIds = [blockDocumentId(userA, userB), blockDocumentId(userB, userA)];
  const legacyIds = [`${userA}_${userB}`, `${userB}_${userA}`]
    .filter((documentId) => !documentId.includes('/'));
  const documents = await Promise.all(
    [...documentIds, ...legacyIds].map((documentId) => blockCollection.doc(documentId).get())
  );
  return documents.some((document) => document.exists);
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
    ref: DocumentReference;
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
 * Builds a public profile from an explicit allowlist so future private fields
 * cannot accidentally be exposed to peers.
 */
export function toPublicStudentProfile(student: Student & { id: string }): StudentPublicProfile {
  return {
    id: student.id,
    college_id: student.college_id,
    full_name: student.full_name,
    branch: student.branch,
    year: student.year,
    bio: student.bio,
    gender: student.gender,
    profile_photos: student.profile_photos,
    verification_status: student.verification_status,
    intent_flags: student.intent_flags,
    interests: student.interests,
    linkedin_url: student.linkedin_url,
    github_url: student.github_url,
    is_active: student.is_active,
    is_profile_complete: student.is_profile_complete,
    created_at: student.created_at,
    updated_at: student.updated_at,
  };
}
