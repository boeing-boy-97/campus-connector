// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  match.service.ts — Matching & discovery business logic                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { db, FieldValue } from '../config/firebase';
import {
  getStudent,
  getBlockedUserIds,
  areUsersBlocked,
  blockDocumentId,
  participantPairDocumentId,
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
import { Student, StudentPublicProfile } from '../../../../shared/types';
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
  ): Promise<{ profiles: StudentPublicProfile[]; has_more: boolean; next_cursor: string | null }> {
    const { gender_filter, year_filter, page_size = PAGINATION.DISCOVERY_PAGE_SIZE, last_doc_id } = filters;

    // Exclude blocks, pending requests, and active matches in both directions.
    const [blockedIds, sentRequests, receivedRequests, matchesAsA, matchesAsB] = await Promise.all([
      getBlockedUserIds(uid),
      db.collection(COLLECTIONS.CONNECT_REQUESTS)
        .where('from_id', '==', uid)
        .where('status', '==', ConnectRequestStatus.PENDING)
        .get(),
      db.collection(COLLECTIONS.CONNECT_REQUESTS)
        .where('to_id', '==', uid)
        .where('status', '==', ConnectRequestStatus.PENDING)
        .get(),
      db.collection(COLLECTIONS.MATCHES)
        .where('student_a_id', '==', uid)
        .where('status', '==', MatchStatus.ACTIVE)
        .get(),
      db.collection(COLLECTIONS.MATCHES)
        .where('student_b_id', '==', uid)
        .where('status', '==', MatchStatus.ACTIVE)
        .get(),
    ]);
    const excludedIds = new Set(blockedIds);
    sentRequests.docs.forEach((document) => excludedIds.add(document.data().to_id));
    receivedRequests.docs.forEach((document) => excludedIds.add(document.data().from_id));
    matchesAsA.docs.forEach((document) => excludedIds.add(document.data().student_b_id));
    matchesAsB.docs.forEach((document) => excludedIds.add(document.data().student_a_id));

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

    // Scan beyond one page because blocked/connected profiles are filtered in memory.
    const scanLimit = Math.min(page_size * 3 + 1, 151);
    const snap = await query.limit(scanLimit).get();
    const candidates = snap.docs.filter((document) => {
      if (excludedIds.has(document.id)) return false;
      if (!filters.match_type) return true;
      return document.data().intent_flags?.[filters.match_type] === true;
    });
    const pageDocuments = candidates.slice(0, page_size);
    const profiles = pageDocuments.map((document) => toPublicStudentProfile({
      ...(document.data() as Student),
      id: document.id,
    }));
    const hasMore = candidates.length > page_size || snap.docs.length === scanLimit;
    const cursorDocument = candidates.length > page_size
      ? pageDocuments.at(-1)
      : snap.docs.at(-1);

    return {
      profiles,
      has_more: hasMore,
      next_cursor: hasMore ? cursorDocument?.id ?? null : null,
    };
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

    // Validate both profiles and require mutual interest in this connection type.
    const [sender, target] = await Promise.all([getStudent(fromId), getStudent(toId)]);
    if (!sender || !target || !target.is_active) throw Errors.notFound('Student');
    if (target.college_id !== collegeId || sender.college_id !== collegeId) throw Errors.wrongCollege();
    if (target.verification_status !== VerificationStatus.APPROVED) throw Errors.notFound('Student');
    if (!sender.intent_flags?.[matchType] || !target.intent_flags?.[matchType]) {
      throw Errors.preconditionFailed('This connection type is not enabled by both students.');
    }

    // Check block
    if (await areUsersBlocked(fromId, toId)) throw Errors.blocked();

    const pairKey = participantPairDocumentId(fromId, toId);
    const requestRef = db.collection(COLLECTIONS.CONNECT_REQUESTS).doc(pairKey);
    const matchRef = db.collection(COLLECTIONS.MATCHES).doc(pairKey);
    const blocks = db.collection(COLLECTIONS.BLOCKS);
    const forwardBlockRef = blocks.doc(blockDocumentId(fromId, toId));
    const reverseBlockRef = blocks.doc(blockDocumentId(toId, fromId));

    // Check legacy, non-deterministic records while all new records use pairKey.
    const [legacyRequestForward, legacyRequestReverse, legacyMatchForward, legacyMatchReverse] =
      await Promise.all([
        db.collection(COLLECTIONS.CONNECT_REQUESTS)
          .where('from_id', '==', fromId).where('to_id', '==', toId)
          .where('status', '==', ConnectRequestStatus.PENDING).limit(1).get(),
        db.collection(COLLECTIONS.CONNECT_REQUESTS)
          .where('from_id', '==', toId).where('to_id', '==', fromId)
          .where('status', '==', ConnectRequestStatus.PENDING).limit(1).get(),
        db.collection(COLLECTIONS.MATCHES)
          .where('student_a_id', '==', fromId).where('student_b_id', '==', toId)
          .where('status', '==', MatchStatus.ACTIVE).limit(1).get(),
        db.collection(COLLECTIONS.MATCHES)
          .where('student_a_id', '==', toId).where('student_b_id', '==', fromId)
          .where('status', '==', MatchStatus.ACTIVE).limit(1).get(),
      ]);

    if (!legacyRequestForward.empty || !legacyRequestReverse.empty) {
      throw Errors.alreadyExists('A connection request between you is already pending.');
    }
    if (!legacyMatchForward.empty || !legacyMatchReverse.empty) {
      throw Errors.alreadyExists('You are already connected with this person.');
    }

    // Deterministic IDs and a transaction prevent two simultaneous requests.
    await db.runTransaction(async (transaction) => {
      const [requestDocument, matchDocument, forwardBlock, reverseBlock] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(matchRef),
        transaction.get(forwardBlockRef),
        transaction.get(reverseBlockRef),
      ]);

      if (forwardBlock.exists || reverseBlock.exists) throw Errors.blocked();
      if (requestDocument.exists && requestDocument.data()?.status === ConnectRequestStatus.PENDING) {
        throw Errors.alreadyExists('A connection request between you is already pending.');
      }
      if (matchDocument.exists && matchDocument.data()?.status === MatchStatus.ACTIVE) {
        throw Errors.alreadyExists('You are already connected with this person.');
      }

      transaction.set(requestRef, {
        pair_key: pairKey,
        from_id: fromId,
        to_id: toId,
        college_id: collegeId,
        match_type: matchType,
        status: ConnectRequestStatus.PENDING,
        message: message || null,
        created_at: FieldValue.serverTimestamp(),
        responded_at: null,
      });
    });

    await NotificationService.connectRequest({
      toId,
      senderName: sender?.full_name || 'Someone',
      requestId: requestRef.id,
    });

    log.info(`Connect request ${requestRef.id}: ${fromId} → ${toId}`);
    return requestRef.id;
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

    const requestRef = db.collection(COLLECTIONS.CONNECT_REQUESTS).doc(requestId);
    const initialRequest = await requestRef.get();
    if (!initialRequest.exists) throw Errors.notFound('Connect request');

    const initialData = initialRequest.data()!;
    if (initialData.to_id !== responderId) throw Errors.forbidden();
    if (action === 'accept' && await areUsersBlocked(initialData.from_id, responderId)) {
      throw Errors.blocked();
    }

    const pairKey = initialData.pair_key || participantPairDocumentId(initialData.from_id, responderId);
    const matchRef = db.collection(COLLECTIONS.MATCHES).doc(pairKey);
    const blocks = db.collection(COLLECTIONS.BLOCKS);
    const senderBlockRef = blocks.doc(blockDocumentId(initialData.from_id, responderId));
    const responderBlockRef = blocks.doc(blockDocumentId(responderId, initialData.from_id));

    const request = await db.runTransaction(async (transaction) => {
      const [requestDocument, matchDocument, senderBlock, responderBlock] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(matchRef),
        transaction.get(senderBlockRef),
        transaction.get(responderBlockRef),
      ]);
      if (action === 'accept' && (senderBlock.exists || responderBlock.exists)) {
        throw Errors.blocked();
      }
      if (!requestDocument.exists) throw Errors.notFound('Connect request');

      const currentRequest = requestDocument.data()!;
      if (currentRequest.to_id !== responderId) throw Errors.forbidden();
      if (currentRequest.status !== ConnectRequestStatus.PENDING) {
        throw Errors.preconditionFailed('This request has already been responded to.');
      }

      if (action === 'decline') {
        transaction.update(requestRef, {
          status: ConnectRequestStatus.DECLINED,
          responded_at: FieldValue.serverTimestamp(),
        });
        return currentRequest;
      }

      if (matchDocument.exists && matchDocument.data()?.status === MatchStatus.ACTIVE) {
        throw Errors.alreadyExists('You are already connected with this person.');
      }

      transaction.update(requestRef, {
        status: ConnectRequestStatus.ACCEPTED,
        responded_at: FieldValue.serverTimestamp(),
      });
      transaction.set(matchRef, {
        pair_key: pairKey,
        student_a_id: currentRequest.from_id,
        student_b_id: responderId,
        participant_ids: [currentRequest.from_id, responderId],
        college_id: currentRequest.college_id,
        match_type: currentRequest.match_type,
        status: MatchStatus.ACTIVE,
        matched_at: FieldValue.serverTimestamp(),
        last_message_at: null,
        last_message_preview: null,
      });
      return currentRequest;
    });

    if (action === 'decline') {
      log.info(`Request ${requestId} declined by ${responderId}`);
      return null;
    }

    const responder = await getStudent(responderId);
    await NotificationService.newMatch({
      toId: request.from_id,
      matchedName: responder?.full_name || 'Someone',
      matchId: matchRef.id,
    });

    log.info(`Match created: ${matchRef.id} (${request.from_id} ↔ ${responderId})`);
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
