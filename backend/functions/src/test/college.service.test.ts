import { firestoreMock, resetAllMocks } from './setup';
import { Timestamp } from './firestore.mock';
import { CollegeService } from '../services/college.service';
import { runCleanup } from '../functions/maintenance/cleanupExpiredRecords';
import { COLLECTIONS } from '../../../../shared/constants';
import {
  CollegeVerifiedStatus,
  ConnectRequestStatus,
} from '../../../../shared/enums';

function seedCollege(id: string, overrides: Record<string, unknown> = {}) {
  firestoreMock.seed(COLLECTIONS.COLLEGES, id, {
    name: 'JD College of Engineering',
    short_name: 'JD College',
    domain: 'jdcollege.edu.in',
    logo_url: 'https://cdn.example.edu/logo.png',
    primary_color: '#1A237E',
    secondary_color: '#E91E63',
    city: 'Nagpur',
    state: 'Maharashtra',
    verified_status: CollegeVerifiedStatus.APPROVED,
    created_at: Timestamp.now(),
    ...overrides,
  });
}

beforeEach(resetAllMocks);

describe('CollegeService.getByDomain', () => {
  it('resolves an approved college from an email address', async () => {
    seedCollege('college-1');

    const college = await CollegeService.getByDomain('student@jdcollege.edu.in');

    expect(college).toMatchObject({ id: 'college-1', short_name: 'JD College' });
  });

  it('is case-insensitive on the domain', async () => {
    seedCollege('college-1');

    await expect(CollegeService.getByDomain('Student@JDCollege.edu.in'))
      .resolves.toMatchObject({ id: 'college-1' });
  });

  it('does not resolve a pending college, so signups stay closed until approval', async () => {
    seedCollege('college-1', { verified_status: CollegeVerifiedStatus.PENDING });

    await expect(CollegeService.getByDomain('student@jdcollege.edu.in')).resolves.toBeNull();
  });

  it('does not resolve a rejected college', async () => {
    seedCollege('college-1', { verified_status: CollegeVerifiedStatus.REJECTED });

    await expect(CollegeService.getByDomain('student@jdcollege.edu.in')).resolves.toBeNull();
  });

  it('returns null for an unregistered domain', async () => {
    seedCollege('college-1');

    await expect(CollegeService.getByDomain('someone@gmail.com')).resolves.toBeNull();
  });

  it('returns null for a malformed address rather than throwing', async () => {
    await expect(CollegeService.getByDomain('no-at-sign')).resolves.toBeNull();
  });
});

describe('CollegeService.create', () => {
  const input = {
    name: 'VNIT Nagpur',
    short_name: 'VNIT',
    domain: 'student.vnit.ac.in',
    logo_url: 'https://cdn.example.edu/vnit.png',
    primary_color: '#0D47A1',
    secondary_color: '#FF6F00',
    city: 'Nagpur',
    state: 'Maharashtra',
  };

  it('creates a pending college and writes an audit entry', async () => {
    const id = await CollegeService.create(input, 'admin-1');

    expect(firestoreMock.raw(COLLECTIONS.COLLEGES, id)).toMatchObject({
      domain: 'student.vnit.ac.in',
      verified_status: CollegeVerifiedStatus.PENDING,
    });

    expect(Object.values(firestoreMock.dump(COLLECTIONS.AUDIT_LOGS))[0]).toMatchObject({
      action: 'create_college',
      admin_id: 'admin-1',
      target_id: id,
    });
  });

  it('refuses a duplicate domain, so two colleges cannot claim one domain', async () => {
    await CollegeService.create(input, 'admin-1');

    await expect(CollegeService.create(input, 'admin-1'))
      .rejects.toThrow(/already registered/i);
  });

  it('refuses a duplicate domain even when the existing college is only pending', async () => {
    seedCollege('existing', {
      domain: 'student.vnit.ac.in',
      verified_status: CollegeVerifiedStatus.PENDING,
    });

    await expect(CollegeService.create(input, 'admin-1'))
      .rejects.toThrow(/already registered/i);
  });
});

describe('CollegeService.changeStatus', () => {
  it('approves a college and audits the decision', async () => {
    seedCollege('college-1', { verified_status: CollegeVerifiedStatus.PENDING });

    await CollegeService.changeStatus('college-1', 'approve', 'admin-1');

    expect(firestoreMock.raw(COLLECTIONS.COLLEGES, 'college-1')).toMatchObject({
      verified_status: CollegeVerifiedStatus.APPROVED,
      approved_by: 'admin-1',
    });
    expect(Object.values(firestoreMock.dump(COLLECTIONS.AUDIT_LOGS))[0])
      .toMatchObject({ action: 'approve_college' });
  });

  it('rejects a college and records the reason', async () => {
    seedCollege('college-1', { verified_status: CollegeVerifiedStatus.PENDING });

    await CollegeService.changeStatus('college-1', 'reject', 'admin-1', 'Domain unverifiable.');

    expect(firestoreMock.raw(COLLECTIONS.COLLEGES, 'college-1')).toMatchObject({
      verified_status: CollegeVerifiedStatus.REJECTED,
      rejection_reason: 'Domain unverifiable.',
    });
  });

  it('rejects an unknown college', async () => {
    await expect(CollegeService.changeStatus('ghost', 'approve', 'admin-1'))
      .rejects.toThrow(/not found/i);
  });
});

describe('CollegeService.getBranding', () => {
  it('returns only presentation fields', async () => {
    seedCollege('college-1', { student_count: 3000 });

    const branding = await CollegeService.getBranding('college-1');

    expect(branding).toEqual({
      college_id: 'college-1',
      name: 'JD College of Engineering',
      short_name: 'JD College',
      logo_url: 'https://cdn.example.edu/logo.png',
      primary_color: '#1A237E',
      secondary_color: '#E91E63',
    });
    // Operational data is not part of the public branding payload.
    expect(branding).not.toHaveProperty('student_count');
    expect(branding).not.toHaveProperty('verified_status');
  });

  it('rejects an unknown college', async () => {
    await expect(CollegeService.getBranding('ghost')).rejects.toThrow(/not found/i);
  });
});

describe('scheduled cleanup', () => {
  it('deletes expired OTP records but keeps live ones', async () => {
    const now = new Date();
    firestoreMock.seed(COLLECTIONS.OTP_RECORDS, 'expired', {
      email: 'a@college.edu',
      expires_at: new Date(now.getTime() - 60_000),
    });
    firestoreMock.seed(COLLECTIONS.OTP_RECORDS, 'live', {
      email: 'b@college.edu',
      expires_at: new Date(now.getTime() + 60_000),
    });

    const result = await runCleanup(now);

    expect(result.otp_records).toBe(1);
    expect(firestoreMock.raw(COLLECTIONS.OTP_RECORDS, 'expired')).toBeUndefined();
    expect(firestoreMock.raw(COLLECTIONS.OTP_RECORDS, 'live')).toBeDefined();
  });

  it('deletes closed rate-limit windows', async () => {
    const now = new Date();
    firestoreMock.seed(COLLECTIONS.RATE_LIMITS, 'old', {
      expires_at: new Date(now.getTime() - 1000),
    });
    firestoreMock.seed(COLLECTIONS.RATE_LIMITS, 'current', {
      expires_at: new Date(now.getTime() + 60_000),
    });

    const result = await runCleanup(now);

    expect(result.rate_limits).toBe(1);
    expect(firestoreMock.raw(COLLECTIONS.RATE_LIMITS, 'current')).toBeDefined();
  });

  it('expires stale pending requests without deleting the record', async () => {
    const now = new Date();
    firestoreMock.seed(COLLECTIONS.CONNECT_REQUESTS, 'stale', {
      from_id: 'a',
      to_id: 'b',
      status: ConnectRequestStatus.PENDING,
      created_at: Timestamp.fromDate(new Date(now.getTime() - 31 * 24 * 3600 * 1000)),
    });
    firestoreMock.seed(COLLECTIONS.CONNECT_REQUESTS, 'fresh', {
      from_id: 'c',
      to_id: 'd',
      status: ConnectRequestStatus.PENDING,
      created_at: Timestamp.fromDate(now),
    });

    const result = await runCleanup(now);

    expect(result.connect_requests).toBe(1);
    expect(firestoreMock.raw(COLLECTIONS.CONNECT_REQUESTS, 'stale'))
      .toMatchObject({ status: ConnectRequestStatus.EXPIRED });
    expect(firestoreMock.raw(COLLECTIONS.CONNECT_REQUESTS, 'fresh'))
      .toMatchObject({ status: ConnectRequestStatus.PENDING });
  });

  it('is safe to run against empty collections', async () => {
    await expect(runCleanup(new Date())).resolves.toEqual({
      otp_records: 0,
      rate_limits: 0,
      connect_requests: 0,
    });
  });
});
