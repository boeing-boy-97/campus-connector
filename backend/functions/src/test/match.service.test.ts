import { authMock, firestoreMock, resetAllMocks } from './setup';
import { Timestamp } from './firestore.mock';
import { MatchService } from '../services/match.service';
import { participantPairDocumentId, blockDocumentId } from '../utils/firestore.utils';
import { COLLECTIONS } from '../../../../shared/constants';
import {
  ConnectRequestStatus,
  MatchStatus,
  MatchType,
  VerificationStatus,
} from '../../../../shared/enums';

const COLLEGE = 'college-1';
const OTHER_COLLEGE = 'college-2';

interface SeedOptions {
  collegeId?: string;
  status?: VerificationStatus;
  intents?: Partial<Record<MatchType, boolean>>;
  isActive?: boolean;
  complete?: boolean;
  year?: number;
  gender?: string;
  createdSecondsAgo?: number;
}

function seedStudent(id: string, options: SeedOptions = {}) {
  const intents = {
    dating: false,
    friendship: true,
    study: false,
    hackathon: false,
    project: false,
    ...options.intents,
  };

  firestoreMock.seed(COLLECTIONS.STUDENTS, id, {
    id,
    college_id: options.collegeId ?? COLLEGE,
    college_email: `${id}@college.edu`,
    full_name: `Student ${id}`,
    branch: 'Computer Science',
    year: options.year ?? 2,
    bio: 'A student who builds things.',
    gender: options.gender ?? 'prefer_not_to_say',
    profile_photos: [],
    verification_status: options.status ?? VerificationStatus.APPROVED,
    intent_flags: intents,
    interests: ['coding'],
    is_active: options.isActive ?? true,
    is_profile_complete: options.complete ?? true,
    created_at: Timestamp.fromDate(
      new Date(Date.now() - (options.createdSecondsAgo ?? 0) * 1000),
    ),
    updated_at: Timestamp.now(),
  });
}

beforeEach(() => {
  resetAllMocks();
  authMock.users.set('me', { uid: 'me', email: 'me@college.edu', customClaims: {} });
});

describe('MatchService.getRecommendations', () => {
  it('returns same-college verified students and excludes the caller', async () => {
    seedStudent('me');
    seedStudent('peer-1');
    seedStudent('peer-2');

    const result = await MatchService.getRecommendations('me', COLLEGE, {});
    const ids = result.profiles.map((profile) => profile.id);

    expect(ids).toEqual(expect.arrayContaining(['peer-1', 'peer-2']));
    expect(ids).not.toContain('me');
  });

  it('never returns students from another college', async () => {
    seedStudent('me');
    seedStudent('outsider', { collegeId: OTHER_COLLEGE });

    const result = await MatchService.getRecommendations('me', COLLEGE, {});

    expect(result.profiles.map((profile) => profile.id)).not.toContain('outsider');
  });

  it('excludes unverified, inactive and incomplete profiles', async () => {
    seedStudent('me');
    seedStudent('pending', { status: VerificationStatus.PENDING });
    seedStudent('suspended', { status: VerificationStatus.SUSPENDED });
    seedStudent('inactive', { isActive: false });
    seedStudent('incomplete', { complete: false });
    seedStudent('good');

    const result = await MatchService.getRecommendations('me', COLLEGE, {});

    expect(result.profiles.map((profile) => profile.id)).toEqual(['good']);
  });

  it('only returns profiles that opted into the requested connection type', async () => {
    seedStudent('me', { intents: { project: true } });
    seedStudent('builder', { intents: { project: true } });
    seedStudent('friend-only', { intents: { project: false, friendship: true } });

    const result = await MatchService.getRecommendations('me', COLLEGE, {
      match_type: MatchType.PROJECT,
    });

    expect(result.profiles.map((profile) => profile.id)).toEqual(['builder']);
  });

  it('excludes blocked users in both directions', async () => {
    seedStudent('me');
    seedStudent('i-blocked-them');
    seedStudent('they-blocked-me');
    seedStudent('neutral');

    firestoreMock.seed(COLLECTIONS.BLOCKS, blockDocumentId('me', 'i-blocked-them'), {
      blocker_id: 'me', blocked_id: 'i-blocked-them', college_id: COLLEGE,
    });
    firestoreMock.seed(COLLECTIONS.BLOCKS, blockDocumentId('they-blocked-me', 'me'), {
      blocker_id: 'they-blocked-me', blocked_id: 'me', college_id: COLLEGE,
    });

    const result = await MatchService.getRecommendations('me', COLLEGE, {});
    const ids = result.profiles.map((profile) => profile.id);

    expect(ids).toEqual(['neutral']);
  });

  it('excludes people with a pending request in either direction and active matches', async () => {
    seedStudent('me');
    seedStudent('i-requested');
    seedStudent('requested-me');
    seedStudent('already-matched');
    seedStudent('available');

    firestoreMock.seed(COLLECTIONS.CONNECT_REQUESTS, 'r1', {
      from_id: 'me', to_id: 'i-requested', status: ConnectRequestStatus.PENDING,
    });
    firestoreMock.seed(COLLECTIONS.CONNECT_REQUESTS, 'r2', {
      from_id: 'requested-me', to_id: 'me', status: ConnectRequestStatus.PENDING,
    });
    firestoreMock.seed(COLLECTIONS.MATCHES, 'm1', {
      student_a_id: 'me',
      student_b_id: 'already-matched',
      participant_ids: ['me', 'already-matched'],
      status: MatchStatus.ACTIVE,
    });

    const result = await MatchService.getRecommendations('me', COLLEGE, {});

    expect(result.profiles.map((profile) => profile.id)).toEqual(['available']);
  });

  it('never exposes private fields to peers', async () => {
    seedStudent('me');
    seedStudent('peer');
    // Private data a peer must never receive.
    firestoreMock.seed(COLLECTIONS.STUDENTS, 'peer', {
      ...firestoreMock.raw(COLLECTIONS.STUDENTS, 'peer')!,
      verification_photo_path: 'verification_photos/peer/secret.jpg',
      phone: '+911234567890',
      fcm_token: 'device-token',
      date_of_birth: Timestamp.fromDate(new Date('2003-01-01')),
      consent_given_at: Timestamp.now(),
    });

    const result = await MatchService.getRecommendations('me', COLLEGE, {});
    const [profile] = result.profiles as unknown as Array<Record<string, unknown>>;

    expect(profile).toBeDefined();
    expect(profile).not.toHaveProperty('verification_photo_path');
    expect(profile).not.toHaveProperty('phone');
    expect(profile).not.toHaveProperty('fcm_token');
    expect(profile).not.toHaveProperty('college_email');
    expect(profile).not.toHaveProperty('date_of_birth');
  });

  it('paginates with a cursor rather than capping at one page', async () => {
    seedStudent('me');
    for (let index = 0; index < 8; index += 1) {
      seedStudent(`peer-${index}`, { createdSecondsAgo: index });
    }

    const first = await MatchService.getRecommendations('me', COLLEGE, { page_size: 3 });
    expect(first.profiles).toHaveLength(3);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBeTruthy();

    const second = await MatchService.getRecommendations('me', COLLEGE, {
      page_size: 3,
      last_doc_id: first.next_cursor!,
    });

    const firstIds = first.profiles.map((profile) => profile.id);
    const secondIds = second.profiles.map((profile) => profile.id);

    expect(secondIds).toHaveLength(3);
    // No overlap between consecutive pages.
    expect(secondIds.filter((id) => firstIds.includes(id))).toHaveLength(0);
  });

  it('applies year and gender filters', async () => {
    seedStudent('me');
    seedStudent('final-year', { year: 4, gender: 'female' });
    seedStudent('second-year', { year: 2, gender: 'male' });

    const byYear = await MatchService.getRecommendations('me', COLLEGE, { year_filter: 4 });
    expect(byYear.profiles.map((profile) => profile.id)).toEqual(['final-year']);

    const byGender = await MatchService.getRecommendations('me', COLLEGE, { gender_filter: 'male' });
    expect(byGender.profiles.map((profile) => profile.id)).toEqual(['second-year']);
  });
});

describe('MatchService.sendConnectRequest', () => {
  it('creates a pending request and notifies the recipient', async () => {
    seedStudent('me');
    seedStudent('peer');

    const requestId = await MatchService.sendConnectRequest({
      fromId: 'me',
      toId: 'peer',
      collegeId: COLLEGE,
      matchType: MatchType.FRIENDSHIP,
      message: 'Hello there',
    });

    const request = firestoreMock.raw(COLLECTIONS.CONNECT_REQUESTS, requestId);
    expect(request).toMatchObject({
      from_id: 'me',
      to_id: 'peer',
      status: ConnectRequestStatus.PENDING,
      match_type: MatchType.FRIENDSHIP,
      message: 'Hello there',
    });

    // An in-app notification is always persisted, even without a device token.
    const notifications = Object.values(firestoreMock.dump(COLLECTIONS.NOTIFICATIONS));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ user_id: 'peer', is_read: false });
  });

  it('rejects a request to yourself', async () => {
    seedStudent('me');

    await expect(MatchService.sendConnectRequest({
      fromId: 'me', toId: 'me', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    })).rejects.toThrow(/yourself/i);
  });

  it('rejects a cross-college request', async () => {
    seedStudent('me');
    seedStudent('outsider', { collegeId: OTHER_COLLEGE });

    await expect(MatchService.sendConnectRequest({
      fromId: 'me', toId: 'outsider', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    })).rejects.toThrow(/own college/i);
  });

  it('requires both students to have enabled the connection type', async () => {
    seedStudent('me', { intents: { dating: true } });
    seedStudent('peer', { intents: { dating: false } });

    await expect(MatchService.sendConnectRequest({
      fromId: 'me', toId: 'peer', collegeId: COLLEGE, matchType: MatchType.DATING,
    })).rejects.toThrow(/not enabled by both/i);
  });

  it('rejects a duplicate pending request', async () => {
    seedStudent('me');
    seedStudent('peer');

    await MatchService.sendConnectRequest({
      fromId: 'me', toId: 'peer', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    });

    await expect(MatchService.sendConnectRequest({
      fromId: 'me', toId: 'peer', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    })).rejects.toThrow(/already pending/i);
  });

  it('rejects a request when either side has blocked the other', async () => {
    seedStudent('me');
    seedStudent('peer');
    firestoreMock.seed(COLLECTIONS.BLOCKS, blockDocumentId('peer', 'me'), {
      blocker_id: 'peer', blocked_id: 'me', college_id: COLLEGE,
    });

    await expect(MatchService.sendConnectRequest({
      fromId: 'me', toId: 'peer', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    })).rejects.toThrow(/not available/i);
  });

  it('rejects a request to an unverified student', async () => {
    seedStudent('me');
    seedStudent('peer', { status: VerificationStatus.PENDING });

    await expect(MatchService.sendConnectRequest({
      fromId: 'me', toId: 'peer', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    })).rejects.toThrow(/not found/i);
  });

  it('uses a deterministic pair ID so concurrent requests cannot duplicate', async () => {
    seedStudent('me');
    seedStudent('peer');

    const id = await MatchService.sendConnectRequest({
      fromId: 'me', toId: 'peer', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    });

    expect(id).toBe(participantPairDocumentId('me', 'peer'));
    // The ID is order-independent, so a simultaneous reverse request collides.
    expect(participantPairDocumentId('peer', 'me')).toBe(id);
  });
});

describe('MatchService.respondToRequest', () => {
  async function createRequest() {
    seedStudent('sender');
    seedStudent('me');
    return MatchService.sendConnectRequest({
      fromId: 'sender', toId: 'me', collegeId: COLLEGE, matchType: MatchType.FRIENDSHIP,
    });
  }

  it('accepting creates an active match with both participants', async () => {
    const requestId = await createRequest();

    const matchId = await MatchService.respondToRequest({
      requestId, responderId: 'me', action: 'accept',
    });

    expect(matchId).toBeTruthy();
    const match = firestoreMock.raw(COLLECTIONS.MATCHES, matchId!);
    expect(match).toMatchObject({
      student_a_id: 'sender',
      student_b_id: 'me',
      status: MatchStatus.ACTIVE,
    });
    expect(match!.participant_ids).toEqual(expect.arrayContaining(['sender', 'me']));

    expect(firestoreMock.raw(COLLECTIONS.CONNECT_REQUESTS, requestId))
      .toMatchObject({ status: ConnectRequestStatus.ACCEPTED });
  });

  it('declining records the outcome and creates no match', async () => {
    const requestId = await createRequest();

    const matchId = await MatchService.respondToRequest({
      requestId, responderId: 'me', action: 'decline',
    });

    expect(matchId).toBeNull();
    expect(firestoreMock.raw(COLLECTIONS.CONNECT_REQUESTS, requestId))
      .toMatchObject({ status: ConnectRequestStatus.DECLINED });
    expect(Object.keys(firestoreMock.dump(COLLECTIONS.MATCHES))).toHaveLength(0);
  });

  it('refuses to let a third party answer someone else’s request', async () => {
    const requestId = await createRequest();
    seedStudent('stranger');

    await expect(MatchService.respondToRequest({
      requestId, responderId: 'stranger', action: 'accept',
    })).rejects.toThrow(/permission/i);
  });

  it('refuses to answer the same request twice', async () => {
    const requestId = await createRequest();
    await MatchService.respondToRequest({ requestId, responderId: 'me', action: 'accept' });

    await expect(MatchService.respondToRequest({
      requestId, responderId: 'me', action: 'accept',
    })).rejects.toThrow(/already been responded/i);
  });

  it('refuses to accept once a block exists', async () => {
    const requestId = await createRequest();
    firestoreMock.seed(COLLECTIONS.BLOCKS, blockDocumentId('me', 'sender'), {
      blocker_id: 'me', blocked_id: 'sender', college_id: COLLEGE,
    });

    await expect(MatchService.respondToRequest({
      requestId, responderId: 'me', action: 'accept',
    })).rejects.toThrow(/not available/i);
  });
});

describe('MatchService.unmatch', () => {
  it('marks the match unmatched and records who ended it', async () => {
    seedStudent('me');
    seedStudent('peer');
    const pairId = participantPairDocumentId('me', 'peer');
    firestoreMock.seed(COLLECTIONS.MATCHES, pairId, {
      student_a_id: 'me',
      student_b_id: 'peer',
      participant_ids: ['me', 'peer'],
      status: MatchStatus.ACTIVE,
    });

    await MatchService.unmatch(pairId, 'me');

    expect(firestoreMock.raw(COLLECTIONS.MATCHES, pairId)).toMatchObject({
      status: MatchStatus.UNMATCHED,
      unmatched_by: 'me',
    });
  });

  it('refuses to unmatch a match the caller is not part of', async () => {
    firestoreMock.seed(COLLECTIONS.MATCHES, 'other-match', {
      student_a_id: 'a', student_b_id: 'b', status: MatchStatus.ACTIVE,
    });

    await expect(MatchService.unmatch('other-match', 'me')).rejects.toThrow(/permission/i);
  });

  it('rejects an unknown match', async () => {
    await expect(MatchService.unmatch('does-not-exist', 'me')).rejects.toThrow(/not found/i);
  });
});
