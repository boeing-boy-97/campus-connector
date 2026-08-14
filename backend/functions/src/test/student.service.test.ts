import { authMock, firestoreMock, resetAllMocks, storageMock } from './setup';
import { Timestamp } from './firestore.mock';
import { StudentService } from '../services/student.service';
import { COLLECTIONS } from '../../../../shared/constants';
import { MatchStatus, VerificationStatus } from '../../../../shared/enums';

function seedStudent(id: string, overrides: Record<string, unknown> = {}) {
  firestoreMock.seed(COLLECTIONS.STUDENTS, id, {
    id,
    college_id: 'college-1',
    college_email: `${id}@college.edu`,
    full_name: `Student ${id}`,
    branch: 'Computer Science',
    year: 3,
    bio: 'Building things on campus.',
    gender: 'other',
    profile_photos: [],
    verification_status: VerificationStatus.APPROVED,
    is_active: true,
    is_profile_complete: true,
    phone: '+911234567890',
    fcm_token: 'device-token',
    verification_photo_path: `verification_photos/${id}/evidence.jpg`,
    date_of_birth: Timestamp.fromDate(new Date('2003-05-01')),
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
    ...overrides,
  });
  authMock.users.set(id, { uid: id, email: `${id}@college.edu`, customClaims: {} });
}

beforeEach(resetAllMocks);

describe('StudentService.getPublicProfile', () => {
  it('returns only allowlisted fields', async () => {
    seedStudent('viewer');
    seedStudent('target');

    const profile = await StudentService.getPublicProfile('target', 'viewer', 'college-1');
    const keys = Object.keys(profile);

    expect(keys).toContain('full_name');
    expect(keys).toContain('branch');
    expect(keys).not.toContain('college_email');
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('fcm_token');
    expect(keys).not.toContain('verification_photo_path');
    expect(keys).not.toContain('date_of_birth');
  });

  it('refuses a cross-college lookup', async () => {
    seedStudent('viewer');
    seedStudent('outsider', { college_id: 'college-2' });

    await expect(StudentService.getPublicProfile('outsider', 'viewer', 'college-1'))
      .rejects.toThrow(/own college/i);
  });

  it('hides unverified students', async () => {
    seedStudent('viewer');
    seedStudent('pending', { verification_status: VerificationStatus.PENDING });

    await expect(StudentService.getPublicProfile('pending', 'viewer', 'college-1'))
      .rejects.toThrow(/not found/i);
  });

  it('hides deactivated and deleted students', async () => {
    seedStudent('viewer');
    seedStudent('gone', { is_active: false });
    seedStudent('erased', { deleted_at: Timestamp.now() });

    await expect(StudentService.getPublicProfile('gone', 'viewer', 'college-1'))
      .rejects.toThrow(/not found/i);
    await expect(StudentService.getPublicProfile('erased', 'viewer', 'college-1'))
      .rejects.toThrow(/not found/i);
  });
});

describe('StudentService.update', () => {
  it('applies allowed changes', async () => {
    seedStudent('me');

    await StudentService.update('me', { bio: 'An updated bio for my profile.' } as never);

    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, 'me')!.bio)
      .toBe('An updated bio for my profile.');
  });

  it('silently drops immutable fields instead of trusting the client', async () => {
    seedStudent('me');

    await StudentService.update('me', {
      bio: 'Still ten characters long.',
      college_id: 'college-999',
      college_email: 'attacker@evil.test',
      verification_status: VerificationStatus.APPROVED,
      id: 'someone-else',
    } as never);

    const student = firestoreMock.raw(COLLECTIONS.STUDENTS, 'me')!;
    expect(student.college_id).toBe('college-1');
    expect(student.college_email).toBe('me@college.edu');
    expect(student.id).toBe('me');
  });

  it('rejects an update for a profile that does not exist', async () => {
    await expect(StudentService.update('ghost', { bio: 'nothing here' } as never))
      .rejects.toThrow(/not found/i);
  });
});

describe('StudentService.setProfilePhotos', () => {
  beforeEach(() => {
    seedStudent('me');
  });

  it('accepts owned uploads and stores the ordered paths', async () => {
    const first = 'profile_photos/me/one.jpg';
    const second = 'profile_photos/me/two.jpg';
    storageMock.put(first, { contentType: 'image/jpeg', size: 2048 });
    storageMock.put(second, { contentType: 'image/webp', size: 4096 });

    const result = await StudentService.setProfilePhotos('me', [first, second]);

    expect(result).toEqual([first, second]);
    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, 'me')!.profile_photos).toEqual([first, second]);
  });

  it('refuses a path in another user’s folder', async () => {
    const foreign = 'profile_photos/someone-else/one.jpg';
    storageMock.put(foreign, { contentType: 'image/jpeg' });

    await expect(StudentService.setProfilePhotos('me', [foreign]))
      .rejects.toThrow(/your own folder/i);
  });

  it('refuses a path that does not exist in the bucket', async () => {
    await expect(StudentService.setProfilePhotos('me', ['profile_photos/me/missing.jpg']))
      .rejects.toThrow(/not found/i);
  });

  it('refuses a non-image upload', async () => {
    const path = 'profile_photos/me/document.pdf';
    storageMock.put(path, { contentType: 'application/pdf', size: 100 });

    await expect(StudentService.setProfilePhotos('me', [path]))
      .rejects.toThrow(/JPEG, PNG, or WebP/i);
  });

  it('refuses an oversized image', async () => {
    const path = 'profile_photos/me/huge.jpg';
    storageMock.put(path, { contentType: 'image/jpeg', size: 9 * 1024 * 1024 });

    await expect(StudentService.setProfilePhotos('me', [path]))
      .rejects.toThrow(/smaller than 8 MB/i);
  });

  it('refuses more than the maximum number of photos', async () => {
    const paths = Array.from({ length: 7 }, (_, index) => `profile_photos/me/${index}.jpg`);
    paths.forEach((path) => storageMock.put(path, { contentType: 'image/jpeg', size: 100 }));

    await expect(StudentService.setProfilePhotos('me', paths))
      .rejects.toThrow(/at most 6/i);
  });

  it('refuses duplicates', async () => {
    const path = 'profile_photos/me/one.jpg';
    storageMock.put(path, { contentType: 'image/jpeg', size: 100 });

    await expect(StudentService.setProfilePhotos('me', [path, path]))
      .rejects.toThrow(/duplicate/i);
  });

  it('removes orphaned uploads when a photo is dropped', async () => {
    const kept = 'profile_photos/me/keep.jpg';
    const dropped = 'profile_photos/me/drop.jpg';
    storageMock.put(kept, { contentType: 'image/jpeg', size: 100 });
    storageMock.put(dropped, { contentType: 'image/jpeg', size: 100 });

    await StudentService.setProfilePhotos('me', [kept, dropped]);
    await StudentService.setProfilePhotos('me', [kept]);

    expect(storageMock.deleted).toContain(dropped);
    expect(storageMock.files.has(kept)).toBe(true);
  });
});

describe('StudentService.suspend and reinstate', () => {
  beforeEach(() => {
    seedStudent('offender');
    seedStudent('victim');
    firestoreMock.seed(COLLECTIONS.MATCHES, 'match-1', {
      student_a_id: 'offender',
      student_b_id: 'victim',
      participant_ids: ['offender', 'victim'],
      status: MatchStatus.ACTIVE,
    });
  });

  it('suspends the account, closes matches, revokes tokens and audits', async () => {
    await StudentService.suspend('offender', 'moderator-1', 'Confirmed harassment.');

    const student = firestoreMock.raw(COLLECTIONS.STUDENTS, 'offender')!;
    expect(student.verification_status).toBe(VerificationStatus.SUSPENDED);
    expect(student.is_active).toBe(false);
    expect(student.suspension_reason).toBe('Confirmed harassment.');
    expect(student.previous_verification_status).toBe(VerificationStatus.APPROVED);

    // The match is closed so contact stops immediately.
    expect(firestoreMock.raw(COLLECTIONS.MATCHES, 'match-1')!.status)
      .toBe(MatchStatus.UNMATCHED);

    // The session is invalidated rather than left alive until token expiry.
    expect(authMock.revokedTokens).toContain('offender');
    expect(authMock.users.get('offender')!.customClaims)
      .toMatchObject({ verification_status: VerificationStatus.SUSPENDED });

    const audit = Object.values(firestoreMock.dump(COLLECTIONS.AUDIT_LOGS));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'suspend_user',
      admin_id: 'moderator-1',
      target_id: 'offender',
    });

    // The suspended user is told why.
    expect(Object.values(firestoreMock.dump(COLLECTIONS.NOTIFICATIONS))[0])
      .toMatchObject({ user_id: 'offender' });
  });

  it('refuses to suspend the same account twice', async () => {
    await StudentService.suspend('offender', 'moderator-1', 'First offence.');

    await expect(StudentService.suspend('offender', 'moderator-1', 'Again.'))
      .rejects.toThrow(/already suspended/i);
  });

  it('restores the previous status on reinstatement', async () => {
    await StudentService.suspend('offender', 'moderator-1', 'Confirmed harassment.');
    await StudentService.reinstate('offender', 'moderator-1', 'Appeal upheld.');

    const student = firestoreMock.raw(COLLECTIONS.STUDENTS, 'offender')!;
    expect(student.verification_status).toBe(VerificationStatus.APPROVED);
    expect(student.is_active).toBe(true);
    expect(student.suspension_reason).toBeUndefined();
    expect(student.previous_verification_status).toBeUndefined();
  });

  it('reinstates a previously pending account back to pending, not approved', async () => {
    seedStudent('newcomer', { verification_status: VerificationStatus.PENDING });
    await StudentService.suspend('newcomer', 'moderator-1', 'Suspicious signup.');
    await StudentService.reinstate('newcomer', 'moderator-1');

    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, 'newcomer')!.verification_status)
      .toBe(VerificationStatus.PENDING);
  });

  it('refuses to reinstate an account that is not suspended', async () => {
    await expect(StudentService.reinstate('offender', 'moderator-1'))
      .rejects.toThrow(/not suspended/i);
  });

  it('rejects suspending an unknown student', async () => {
    await expect(StudentService.suspend('ghost', 'moderator-1', 'reason here'))
      .rejects.toThrow(/not found/i);
  });
});

describe('StudentService.deleteAccount', () => {
  it('anonymises PII, closes matches, disables auth and revokes tokens', async () => {
    seedStudent('leaver');
    seedStudent('friend');
    firestoreMock.seed(COLLECTIONS.MATCHES, 'match-1', {
      student_a_id: 'leaver',
      student_b_id: 'friend',
      participant_ids: ['leaver', 'friend'],
      status: MatchStatus.ACTIVE,
    });

    await StudentService.deleteAccount('leaver', 'user_requested');

    const student = firestoreMock.raw(COLLECTIONS.STUDENTS, 'leaver')!;
    expect(student.full_name).toBe('Deleted User');
    expect(student.bio).toBeNull();
    expect(student.phone).toBeNull();
    expect(student.fcm_token).toBeNull();
    expect(student.date_of_birth).toBeNull();
    expect(student.profile_photos).toEqual([]);
    expect(student.college_email).toBe('deleted_leaver@anonymous.local');
    expect(student.verification_status).toBe(VerificationStatus.DELETED);
    expect(student.is_active).toBe(false);

    expect(firestoreMock.raw(COLLECTIONS.MATCHES, 'match-1')!.status)
      .toBe(MatchStatus.UNMATCHED);
    expect(authMock.users.get('leaver')!.disabled).toBe(true);
    expect(authMock.revokedTokens).toContain('leaver');

    expect(Object.values(firestoreMock.dump(COLLECTIONS.AUDIT_LOGS))[0])
      .toMatchObject({ action: 'delete_account', target_id: 'leaver' });
  });

  it('rejects deleting an unknown profile', async () => {
    await expect(StudentService.deleteAccount('ghost')).rejects.toThrow(/not found/i);
  });
});

describe('StudentService.syncAuthClaims', () => {
  it('mirrors college and verification state, preserving a privileged role', async () => {
    seedStudent('staff');
    authMock.users.set('staff', {
      uid: 'staff',
      email: 'staff@college.edu',
      customClaims: { role: 'moderator' },
    });

    await StudentService.syncAuthClaims('staff');

    expect(authMock.users.get('staff')!.customClaims).toEqual({
      role: 'moderator',
      college_id: 'college-1',
      verification_status: VerificationStatus.APPROVED,
    });
  });

  it('defaults an ordinary account to the student role', async () => {
    seedStudent('me');

    await StudentService.syncAuthClaims('me');

    expect(authMock.users.get('me')!.customClaims).toMatchObject({ role: 'student' });
  });

  it('does nothing for a missing profile', async () => {
    await expect(StudentService.syncAuthClaims('ghost')).resolves.toBeUndefined();
  });
});

describe('StudentService.updateFcmToken', () => {
  it('stores the device token', async () => {
    seedStudent('me');

    await StudentService.updateFcmToken('me', 'new-device-token');

    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, 'me')!.fcm_token).toBe('new-device-token');
  });
});
