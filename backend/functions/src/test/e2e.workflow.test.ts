/**
 * End-to-end workflow test.
 *
 * Drives the *deployed handler functions* (not just the services) through a
 * complete student journey, in order, against the in-memory Firebase doubles:
 *
 *   request OTP → verify OTP → create profile → submit verification evidence
 *   → moderator approves → discover peers → send request → peer accepts
 *   → exchange messages → read receipts → verify persistence → edit profile
 *   → report and block → moderator suspends → verify access is revoked
 *
 * This is the closest achievable equivalent to the emulator-based end-to-end run
 * in an environment where the emulator JARs cannot be downloaded.
 */

import { authMock, firestoreMock, resetAllMocks, storageMock } from './setup';
import { Timestamp } from './firestore.mock';
import type * as functions from 'firebase-functions/v1';

import { sendOtp } from '../functions/auth/sendOtp';
import { verifyOtp } from '../functions/auth/verifyOtp';
import { login } from '../functions/auth/login';
import { createProfile } from '../functions/users/createProfile';
import { updateProfile } from '../functions/users/updateProfile';
import { getProfile } from '../functions/users/getProfile';
import { submitVerificationPhoto } from '../functions/users/submitVerificationPhoto';
import { reviewVerificationPhoto } from '../functions/moderation/verifyPhoto';
import { getVerificationQueue } from '../functions/moderation/getVerificationQueue';
import { getRecommendations } from '../functions/matching/recommendations';
import { sendConnectRequest } from '../functions/matching/connectRequest';
import { acceptConnectRequest } from '../functions/matching/acceptRequest';
import { sendMessage } from '../functions/chat/sendMessage';
import { markRead } from '../functions/chat/readMessage';
import { reportUser } from '../functions/moderation/reportUser';
import { blockUser } from '../functions/moderation/blockUser';
import { reviewReport } from '../functions/moderation/reviewReport';
import { suspendUser } from '../functions/moderation/suspendUser';
import { getNotifications } from '../functions/notifications/getNotifications';
import { checkEmailDomain } from '../functions/colleges/domainCheck';

import { COLLECTIONS } from '../../../../shared/constants';
import {
  CollegeVerifiedStatus,
  MatchStatus,
  MatchType,
  VerificationStatus,
} from '../../../../shared/enums';

type CallableContext = functions.https.CallableContext;

/** Invokes a v1 callable's handler directly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke<T = any>(callable: unknown, data: unknown, context: CallableContext): Promise<T> {
  // firebase-functions exposes the wrapped handler under `run` for v1 callables.
  const runnable = callable as { run: (data: unknown, context: CallableContext) => Promise<T> };
  return runnable.run(data, context);
}

function contextFor(uid: string, claims: Record<string, unknown> = {}): CallableContext {
  const user = authMock.users.get(uid);
  return {
    auth: {
      uid,
      token: {
        email: user?.email ?? `${uid}@jdcollege.edu.in`,
        email_verified: true,
        ...(user?.customClaims ?? {}),
        ...claims,
      },
    },
  } as unknown as CallableContext;
}

const ANONYMOUS = {} as CallableContext;
const COLLEGE_ID = 'college-jd';
const DOMAIN = 'jdcollege.edu.in';

function seedApprovedCollege() {
  firestoreMock.seed(COLLECTIONS.COLLEGES, COLLEGE_ID, {
    name: 'JD College of Engineering',
    short_name: 'JD College',
    domain: DOMAIN,
    logo_url: 'https://cdn.example.edu/jd.png',
    primary_color: '#1A237E',
    secondary_color: '#E91E63',
    city: 'Nagpur',
    state: 'Maharashtra',
    verified_status: CollegeVerifiedStatus.APPROVED,
    created_at: Timestamp.now(),
  });
}

/** A date of birth that is comfortably over 18. */
const ADULT_DOB = '2003-04-15';

const PROFILE_INPUT = {
  full_name: 'Asha Kulkarni',
  date_of_birth: ADULT_DOB,
  gender: 'female',
  bio: 'Third-year CS student who likes building side projects and playing chess.',
  branch: 'Computer Science',
  year: 3,
  interests: ['coding', 'chess', 'design'],
  intent_flags: {
    dating: false, friendship: true, study: true, hackathon: true, project: true,
  },
  consent_given: true,
  consent_version: '1.0.0',
};

/** Runs the full signup → verified journey and returns the new UID. */
async function onboardStudent(
  email: string,
  overrides: Partial<typeof PROFILE_INPUT> = {},
): Promise<string> {
  await invoke(sendOtp, { email, consent_given: true, consent_version: '1.0.0' }, ANONYMOUS);

  // The emulator path logs the OTP instead of e-mailing it, so read the record
  // and reproduce the code the way a student would from their inbox.
  const otpRecords = firestoreMock.dump(COLLECTIONS.OTP_RECORDS);
  const recordId = Object.keys(otpRecords).find(
    (id) => otpRecords[id].email === email.trim().toLowerCase(),
  )!;
  expect(recordId).toBeDefined();

  // Replace the stored hash with a known code: the real OTP is never persisted
  // in plaintext (by design), so a test cannot read it back.
  const { hashOtp } = await import('../utils/otp.utils');
  firestoreMock.seed(COLLECTIONS.OTP_RECORDS, recordId, {
    ...otpRecords[recordId],
    otp_hash: await hashOtp('123456'),
  });

  const verified = await invoke(verifyOtp, { email, otp: '123456' }, ANONYMOUS);
  expect(verified.success).toBe(true);
  const uid = verified.data.uid as string;

  await invoke(
    createProfile,
    { ...PROFILE_INPUT, ...overrides },
    contextFor(uid, { college_id: COLLEGE_ID }),
  );

  const evidencePath = `verification_photos/${uid}/id-card.jpg`;
  storageMock.put(evidencePath, { contentType: 'image/jpeg', size: 4096 });
  await invoke(
    submitVerificationPhoto,
    { storage_path: evidencePath },
    contextFor(uid, { college_id: COLLEGE_ID }),
  );

  await invoke(
    reviewVerificationPhoto,
    { request_id: uid, action: 'approve' },
    contextFor('moderator', { role: 'moderator' }),
  );

  return uid;
}

beforeEach(() => {
  resetAllMocks();
  seedApprovedCollege();
  authMock.users.set('moderator', {
    uid: 'moderator',
    email: 'mod@campusconnect.app',
    customClaims: { role: 'moderator' },
  });
  process.env.FUNCTIONS_EMULATOR = 'true';
});

afterAll(() => {
  delete process.env.FUNCTIONS_EMULATOR;
});

describe('college eligibility', () => {
  it('reports a registered domain before signup', async () => {
    const result = await invoke(checkEmailDomain, { email: `x@${DOMAIN}` }, ANONYMOUS);

    expect(result.data.is_registered).toBe(true);
    expect(result.data.college).toMatchObject({ short_name: 'JD College' });
  });

  it('reports an unregistered domain', async () => {
    const result = await invoke(checkEmailDomain, { email: 'x@gmail.com' }, ANONYMOUS);

    expect(result.data.is_registered).toBe(false);
    expect(result.data.college).toBeNull();
  });
});

describe('OTP request privacy', () => {
  it('returns an identical response for registered and unregistered domains', async () => {
    const registered = await invoke(
      sendOtp,
      { email: `student@${DOMAIN}`, consent_given: true },
      ANONYMOUS,
    );
    const unregistered = await invoke(
      sendOtp,
      { email: 'someone@unknown-college.test', consent_given: true },
      ANONYMOUS,
    );

    // Only the masked address differs; nothing reveals whether the college exists.
    expect(Object.keys(registered.data).sort()).toEqual(Object.keys(unregistered.data).sort());
    expect(registered.data.message).toBe(unregistered.data.message);
    expect(registered.data).not.toHaveProperty('college_name');
  });

  it('refuses to issue a code without consent', async () => {
    await expect(invoke(
      sendOtp,
      { email: `student@${DOMAIN}`, consent_given: false },
      ANONYMOUS,
    )).rejects.toThrow(/Terms of Service/i);
  });

  it('masks the address in the response', async () => {
    const result = await invoke(
      sendOtp,
      { email: `student@${DOMAIN}`, consent_given: true },
      ANONYMOUS,
    );

    expect(result.data.masked_email).toBe(`s***t@${DOMAIN}`);
    expect(result.data.masked_email).not.toBe(`student@${DOMAIN}`);
  });
});

describe('complete student journey', () => {
  it('carries a student from signup through verification to a live profile', async () => {
    const uid = await onboardStudent(`asha@${DOMAIN}`);

    const student = firestoreMock.raw(COLLECTIONS.STUDENTS, uid)!;
    expect(student).toMatchObject({
      full_name: 'Asha Kulkarni',
      college_id: COLLEGE_ID,
      verification_status: VerificationStatus.APPROVED,
      is_profile_complete: true,
    });

    // Claims are synchronised so verified-only endpoints become reachable.
    expect(authMock.users.get(uid)!.customClaims).toMatchObject({
      college_id: COLLEGE_ID,
      verification_status: VerificationStatus.APPROVED,
      role: 'student',
    });

    // The approval notified the student.
    const notifications = await invoke(getNotifications, {}, contextFor(uid));
    expect(notifications.data.notifications.some(
      (item: { type: string }) => item.type === 'verification_approved',
    )).toBe(true);
  });

  it('blocks discovery until verification is approved', async () => {
    await invoke(sendOtp, { email: `bob@${DOMAIN}`, consent_given: true }, ANONYMOUS);
    const records = firestoreMock.dump(COLLECTIONS.OTP_RECORDS);
    const recordId = Object.keys(records)[0];
    const { hashOtp } = await import('../utils/otp.utils');
    firestoreMock.seed(COLLECTIONS.OTP_RECORDS, recordId, {
      ...records[recordId],
      otp_hash: await hashOtp('123456'),
    });
    const verified = await invoke(verifyOtp, { email: `bob@${DOMAIN}`, otp: '123456' }, ANONYMOUS);
    const uid = verified.data.uid as string;

    await invoke(createProfile, PROFILE_INPUT, contextFor(uid, { college_id: COLLEGE_ID }));

    // Still pending: the discovery feed must refuse the request.
    await expect(invoke(
      getRecommendations,
      {},
      contextFor(uid, { college_id: COLLEGE_ID, verification_status: 'pending' }),
    )).rejects.toThrow(/must be verified/i);
  });

  it('enforces the 18+ age gate at profile creation', async () => {
    await invoke(sendOtp, { email: `kid@${DOMAIN}`, consent_given: true }, ANONYMOUS);
    const records = firestoreMock.dump(COLLECTIONS.OTP_RECORDS);
    const recordId = Object.keys(records)[0];
    const { hashOtp } = await import('../utils/otp.utils');
    firestoreMock.seed(COLLECTIONS.OTP_RECORDS, recordId, {
      ...records[recordId],
      otp_hash: await hashOtp('123456'),
    });
    const verified = await invoke(verifyOtp, { email: `kid@${DOMAIN}`, otp: '123456' }, ANONYMOUS);
    const uid = verified.data.uid as string;

    const underageDob = new Date();
    underageDob.setFullYear(underageDob.getFullYear() - 16);

    await expect(invoke(
      createProfile,
      { ...PROFILE_INPUT, date_of_birth: underageDob.toISOString().slice(0, 10) },
      contextFor(uid, { college_id: COLLEGE_ID }),
    )).rejects.toThrow(/at least 18/i);
  });

  it('refuses a second profile for the same account', async () => {
    const uid = await onboardStudent(`asha@${DOMAIN}`);

    await expect(invoke(
      createProfile,
      PROFILE_INPUT,
      contextFor(uid, { college_id: COLLEGE_ID }),
    )).rejects.toThrow(/already exists/i);
  });
});

describe('discovery, connection and conversation', () => {
  let asha: string;
  let ravi: string;

  beforeEach(async () => {
    asha = await onboardStudent(`asha@${DOMAIN}`);
    ravi = await onboardStudent(`ravi@${DOMAIN}`, { full_name: 'Ravi Deshmukh' });
  });

  const verifiedContext = (uid: string) =>
    contextFor(uid, {
      college_id: COLLEGE_ID,
      verification_status: VerificationStatus.APPROVED,
    });

  it('surfaces the other verified student in discovery', async () => {
    const result = await invoke(
      getRecommendations,
      { page_size: 10, match_type: MatchType.PROJECT },
      verifiedContext(asha),
    );

    expect(result.data.profiles.map((profile: { id: string }) => profile.id)).toEqual([ravi]);
  });

  it('completes request → accept → message → read receipt, and persists it all', async () => {
    // Asha sends a request.
    const requestResult = await invoke(
      sendConnectRequest,
      { to_id: ravi, match_type: MatchType.PROJECT, message: 'Want to team up?' },
      verifiedContext(asha),
    );
    const requestId = requestResult.data.request_id as string;

    // Ravi accepts.
    const acceptResult = await invoke(
      acceptConnectRequest,
      { request_id: requestId, action: 'accept' },
      verifiedContext(ravi),
    );
    const matchId = acceptResult.data.match_id as string;
    expect(firestoreMock.raw(COLLECTIONS.MATCHES, matchId)).toMatchObject({
      status: MatchStatus.ACTIVE,
    });

    // Asha writes; Ravi's unread counter increments.
    await invoke(
      sendMessage,
      { match_id: matchId, text: 'Hi Ravi, shall we enter the hackathon?' },
      verifiedContext(asha),
    );
    expect(firestoreMock.raw(COLLECTIONS.MATCHES, matchId)![`unread_count_${ravi}`]).toBe(1);

    // Ravi reads, which clears the counter and stamps read_at.
    const readResult = await invoke(markRead, { match_id: matchId }, verifiedContext(ravi));
    expect(readResult.data.marked_read_count).toBe(1);
    expect(firestoreMock.raw(COLLECTIONS.MATCHES, matchId)![`unread_count_${ravi}`]).toBe(0);

    // Ravi replies.
    await invoke(
      sendMessage,
      { match_id: matchId, text: 'Absolutely — let us plan tonight.' },
      verifiedContext(ravi),
    );

    // Everything survives as durable documents (the "refresh the page" check).
    const messages = Object.values(firestoreMock.dump(COLLECTIONS.MESSAGES));
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.match_id === matchId)).toBe(true);
    expect(messages.find((message) => message.sender_id === asha)!.read_at).not.toBeNull();
  });

  it('removes a connected peer from the discovery feed', async () => {
    const request = await invoke(
      sendConnectRequest,
      { to_id: ravi, match_type: MatchType.PROJECT },
      verifiedContext(asha),
    );
    await invoke(
      acceptConnectRequest,
      { request_id: request.data.request_id, action: 'accept' },
      verifiedContext(ravi),
    );

    const feed = await invoke(getRecommendations, { page_size: 10 }, verifiedContext(asha));
    expect(feed.data.profiles).toHaveLength(0);
  });

  it('refuses a message from someone outside the match', async () => {
    const request = await invoke(
      sendConnectRequest,
      { to_id: ravi, match_type: MatchType.PROJECT },
      verifiedContext(asha),
    );
    const accept = await invoke(
      acceptConnectRequest,
      { request_id: request.data.request_id, action: 'accept' },
      verifiedContext(ravi),
    );

    const intruder = await onboardStudent(`eve@${DOMAIN}`, { full_name: 'Eve Stranger' });

    await expect(invoke(
      sendMessage,
      { match_id: accept.data.match_id, text: 'Let me in' },
      verifiedContext(intruder),
    )).rejects.toThrow(/permission/i);
  });

  it('prevents one student reading another student’s private profile fields', async () => {
    const result = await invoke(getProfile, { student_id: ravi }, verifiedContext(asha));

    expect(result.data).not.toHaveProperty('college_email');
    expect(result.data).not.toHaveProperty('verification_photo_path');
    expect(result.data).not.toHaveProperty('date_of_birth');
    expect(result.data.full_name).toBe('Ravi Deshmukh');
  });

  it('lets a student edit their own profile and read it back', async () => {
    await invoke(
      updateProfile,
      { bio: 'Updated bio: now focused on distributed systems.', year: 4 },
      verifiedContext(asha),
    );

    const own = await invoke(getProfile, {}, verifiedContext(asha));
    expect(own.data).toMatchObject({
      bio: 'Updated bio: now focused on distributed systems.',
      year: 4,
    });
  });

  it('rejects an attempt to inject arbitrary profile photo URLs', async () => {
    await expect(invoke(
      updateProfile,
      { profile_photos: ['https://evil.test/tracker.png'] },
      verifiedContext(asha),
    )).rejects.toThrow();
  });
});

describe('safety and moderation', () => {
  let asha: string;
  let troll: string;

  beforeEach(async () => {
    asha = await onboardStudent(`asha@${DOMAIN}`);
    troll = await onboardStudent(`troll@${DOMAIN}`, { full_name: 'Trevor Trouble' });
  });

  const verifiedContext = (uid: string) =>
    contextFor(uid, {
      college_id: COLLEGE_ID,
      verification_status: VerificationStatus.APPROVED,
    });

  it('files a report that a moderator can action, suspending the offender', async () => {
    const report = await invoke(
      reportUser,
      {
        reported_id: troll,
        category: 'chat',
        reason: 'harassment',
        description: 'Repeated unwanted messages.',
      },
      verifiedContext(asha),
    );
    const reportId = report.data.report_id as string;

    // The moderator sees it, suspends the account, then closes the report.
    await invoke(
      suspendUser,
      { student_id: troll, reason: 'Confirmed harassment after review.' },
      contextFor('moderator', { role: 'moderator' }),
    );
    await invoke(
      reviewReport,
      { report_id: reportId, status: 'action_taken', action_notes: 'Account suspended.' },
      contextFor('moderator', { role: 'moderator' }),
    );

    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, troll)).toMatchObject({
      verification_status: VerificationStatus.SUSPENDED,
      is_active: false,
    });
    expect(firestoreMock.raw(COLLECTIONS.REPORTS, reportId)).toMatchObject({
      status: 'action_taken',
      reviewed_by: 'moderator',
    });
    // The suspension invalidated the offender's session.
    expect(authMock.revokedTokens).toContain(troll);
  });

  it('denies a suspended student access to verified-only endpoints', async () => {
    await invoke(
      suspendUser,
      { student_id: troll, reason: 'Confirmed harassment after review.' },
      contextFor('moderator', { role: 'moderator' }),
    );

    await expect(invoke(
      getRecommendations,
      {},
      contextFor(troll, {
        college_id: COLLEGE_ID,
        verification_status: VerificationStatus.SUSPENDED,
      }),
    )).rejects.toThrow(/suspended/i);
  });

  it('blocking unmatches and hides both students from each other', async () => {
    const request = await invoke(
      sendConnectRequest,
      { to_id: troll, match_type: MatchType.FRIENDSHIP },
      verifiedContext(asha),
    );
    const accept = await invoke(
      acceptConnectRequest,
      { request_id: request.data.request_id, action: 'accept' },
      verifiedContext(troll),
    );

    await invoke(blockUser, { blocked_id: troll }, verifiedContext(asha));

    expect(firestoreMock.raw(COLLECTIONS.MATCHES, accept.data.match_id))
      .toMatchObject({ status: MatchStatus.UNMATCHED });

    const feed = await invoke(getRecommendations, {}, verifiedContext(asha));
    expect(feed.data.profiles).toHaveLength(0);

    const reverseFeed = await invoke(getRecommendations, {}, verifiedContext(troll));
    expect(reverseFeed.data.profiles).toHaveLength(0);
  });

  it('refuses to let a student report themselves', async () => {
    await expect(invoke(
      reportUser,
      { reported_id: asha, category: 'other', reason: 'other' },
      verifiedContext(asha),
    )).rejects.toThrow(/cannot report yourself/i);
  });

  it('refuses moderation endpoints to ordinary students', async () => {
    await expect(invoke(
      suspendUser,
      { student_id: troll, reason: 'I do not like them.' },
      verifiedContext(asha),
    )).rejects.toThrow(/moderator access required/i);

    await expect(invoke(
      getVerificationQueue,
      {},
      verifiedContext(asha),
    )).rejects.toThrow(/moderator access required/i);
  });

  it('gives moderators a queue with a signed URL rather than a public path', async () => {
    const pending = await onboardStudent(`newbie@${DOMAIN}`, { full_name: 'Nina Newbie' });
    // Re-submit so there is a pending request in the queue.
    const path = `verification_photos/${pending}/again.jpg`;
    storageMock.put(path, { contentType: 'image/jpeg', size: 2048 });
    firestoreMock.seed(COLLECTIONS.VERIFICATION_REQUESTS, pending, {
      student_id: pending,
      college_id: COLLEGE_ID,
      storage_path: path,
      review_status: 'pending',
      submitted_at: Timestamp.now(),
    });

    const queue = await invoke(
      getVerificationQueue,
      {},
      contextFor('moderator', { role: 'moderator' }),
    );

    const item = queue.data.items.find((entry: { id: string }) => entry.id === pending);
    expect(item).toBeDefined();
    expect(item.verification_photo_url).toContain('https://signed.example/');
    expect(storageMock.signedUrlsIssued).toContain(path);
  });
});

describe('session bootstrap', () => {
  it('records presence and returns college branding', async () => {
    const uid = await onboardStudent(`asha@${DOMAIN}`);

    const result = await invoke(
      login,
      {},
      contextFor(uid, {
        college_id: COLLEGE_ID,
        verification_status: VerificationStatus.APPROVED,
      }),
    );

    expect(result.data).toMatchObject({
      uid,
      has_profile: true,
      college_id: COLLEGE_ID,
    });
    expect(result.data.branding).toMatchObject({ short_name: 'JD College' });
    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, uid)!.last_seen).toBeDefined();
  });

  it('rejects an unauthenticated session bootstrap', async () => {
    await expect(invoke(login, {}, ANONYMOUS)).rejects.toThrow(/authentication required/i);
  });
});
