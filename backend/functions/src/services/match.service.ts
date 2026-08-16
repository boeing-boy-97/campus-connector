// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  match.service.ts — Matching & discovery business logic                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { db, FieldValue } from '../config/firebase';
import {
  getStudent,
  getBlockedUserIds,
  areUsersBlocked,
  toPublicStudentProfile,
} from '../utils/firestore.utils';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { COLLECTIONS, PAGINATION } from '../../../../shared/constants';
import {
  VerificationStatus,
  ConnectRequestStatus,
  MatchStatus,
  MatchType,
} from '../../../../shared/enums';
import { StudentPublicProfile } from '../../../../shared/types';
import { NotificationService } from './notification.service';

const log = createLogger('match.service');

export interface RecommendationsFilter {
  gender_filter?: string;
  year_filter?: number;
  match_type?: MatchType;
  page_size?: number;
  last_doc_id?: string;
}

export const MatchService = {

  /**
   * Returns discovery feed for a student.
   * Enforces: same college, verified only, excludes blocked users.
   */
  async getRecommendations(
    uid: string,
    collegeId: string,
    filters: RecommendationsFilter
  ): Promise<{ profiles: StudentPublicProfile[]; has_more: boolean }> {
    const { gender_filter, year_filter, page_size = PAGINATION.DISCOVERY_PAGE_SIZE, last_doc_id } = filters;

    // Get all blocked user IDs to exclude
    const blockedIds = await getBlockedUserIds(uid);

    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.STUDENTS)
      .where('college_id', '==', collegeId)
      .where('verification_status', '==', VerificationStatus.APPROVED)
      .where('is_active', '==', true)
      .where('is_profile_complete', '==', true);

    if (gender_filter) query = query.where('gender', '==', gender_filter);
    if (year_filter) query = query.where('year', '==', year_filter);

    // Cursor-based pagination
    if (last_doc_id) {
      const lastSnap = await db.collection(COLLECTIONS.STUDENTS).doc(last_doc_id).get();
      if (lastSnap.exists) query = query.startAfter(lastSnap);
    }

    query = query.limit(page_size + 1);
    const snap = await query.get();

    const docs = snap.docs.slice(0, page_size);
    const hasMore = snap.docs.length > page_size;

    const profiles = docs
      .filter((d) => !blockedIds.has(d.id))
      .map((d) => {
        const student = d.data() as any;
        return toPublicStudentProfile({ ...student, id: d.id });
      }) as StudentPublicProfile[];

    return { profiles, has_more: hasMore };
  },

  /**
   * Sends a connect request from one student to another.
   */
  async sendConnectRequest(params: {
    fromId: string;
    toId: string;
    collegeId: string;
    matchType: MatchType;
    message?: string;
  }): Promise<string> {
    const { fromId, toId, collegeId, matchType, message } = params;

    if (fromId === toId) throw Errors.invalidArgument('Cannot send request to yourself.');

    // Validate target
    const target = await getStudent(toId);
    if (!target || !target.is_active) throw Errors.notFound('Student');
    if (target.college_id !== collegeId) throw Errors.wrongCollege();
    if (target.verification_status !== VerificationStatus.APPROVED) throw Errors.notFound('Student');

    // Check block
    if (await areUsersBlocked(fromId, toId)) throw Errors.blocked();

    // Check existing pending request
    const existingReq = await db.collection(COLLECTIONS.CONNECT_REQUESTS)
      .where('from_id', '==', fromId)
      .where('to_id', '==', toId)
      .where('status', '==', ConnectRequestStatus.PENDING)
      .limit(1)
      .get();

    if (!existingReq.empty) {
      throw Errors.alreadyExists('You have already sent a request to this person.');
    }

    // Check if already matched
    const existingMatch = await db.collection(COLLECTIONS.MATCHES)
      .where('student_a_id', 'in', [fromId, toId])
      .where('student_b_id', 'in', [fromId, toId])
      .where('status', '==', MatchStatus.ACTIVE)
      .limit(1)
      .get();

    if (!existingMatch.empty) {
      throw Errors.alreadyExists('You are already connected with this person.');
    }

    const reqRef = await db.collection(COLLECTIONS.CONNECT_REQUESTS).add({
      from_id: fromId,
      to_id: toId,
      college_id: collegeId,
      match_type: matchType,
      status: ConnectRequestStatus.PENDING,
      message: message || null,
      created_at: FieldValue.serverTimestamp(),
    });

    // Get sender name for notification
    const sender = await getStudent(fromId);
    await NotificationService.connectRequest({
      toId,
      senderName: sender?.full_name || 'Someone',
      requestId: reqRef.id,
    });

    log.info(`Connect request ${reqRef.id}: ${fromId} → ${toId}`);
    return reqRef.id;
  },

  /**
   * Accepts or declines a connect request.
   */
  async respondToRequest(params: {
    requestId: string;
    responderId: string;
    action: 'accept' | 'decline';
  }): Promise<string | null> {
    const { requestId, responderId, action } = params;

    const reqRef = db.collection(COLLECTIONS.CONNECT_REQUESTS).doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) throw Errors.notFound('Connect request');

    const req = reqSnap.data()!;

    if (req.to_id !== responderId) throw Errors.forbidden();
    if (req.status !== ConnectRequestStatus.PENDING) {
      throw Errors.preconditionFailed('This request has already been responded to.');
    }

    if (action === 'decline') {
      await reqRef.update({
        status: ConnectRequestStatus.DECLINED,
        responded_at: FieldValue.serverTimestamp(),
      });
      log.info(`Request ${requestId} declined by ${responderId}`);
      return null;
    }

    // Accept — atomic batch
    const matchRef = db.collection(COLLECTIONS.MATCHES).doc();
    const batch = db.batch();

    batch.update(reqRef, {
      status: ConnectRequestStatus.ACCEPTED,
      responded_at: FieldValue.serverTimestamp(),
    });

    batch.set(matchRef, {
      student_a_id: req.from_id,
      student_b_id: responderId,
      college_id: req.college_id,
      match_type: req.match_type,
      status: MatchStatus.ACTIVE,
      matched_at: FieldValue.serverTimestamp(),
      last_message_at: null,
      last_message_preview: null,
    });

    await batch.commit();

    // Notify sender of match
    const responder = await getStudent(responderId);
    await NotificationService.newMatch({
      toId: req.from_id,
      matchedName: responder?.full_name || 'Someone',
      matchId: matchRef.id,
    });

    log.info(`Match created: ${matchRef.id} (${req.from_id} ↔ ${responderId})`);
    return matchRef.id;
  },

  /**
   * Unmatches two connected students.
   */
  async unmatch(matchId: string, requesterId: string): Promise<void> {
    const matchSnap = await db.collection(COLLECTIONS.MATCHES).doc(matchId).get();
    if (!matchSnap.exists) throw Errors.notFound('Match');

    const match = matchSnap.data()!;
    if (match.student_a_id !== requesterId && match.student_b_id !== requesterId) {
      throw Errors.forbidden();
    }

    await db.collection(COLLECTIONS.MATCHES).doc(matchId).update({
      status: MatchStatus.UNMATCHED,
      unmatched_at: FieldValue.serverTimestamp(),
      unmatched_by: requesterId,
    });

    log.info(`Match ${matchId} ended by ${requesterId}`);
  },
};
