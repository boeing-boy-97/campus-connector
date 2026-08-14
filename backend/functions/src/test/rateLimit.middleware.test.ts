import { firestoreMock, resetAllMocks } from './setup';
import { checkRateLimit, RateLimits } from '../middleware/rateLimit.middleware';
import { COLLECTIONS } from '../../../../shared/constants';

beforeEach(resetAllMocks);

describe('checkRateLimit', () => {
  const config = { key: 'test:subject', limit: 3, windowSeconds: 600 };

  it('allows requests up to the limit', async () => {
    await expect(checkRateLimit(config)).resolves.toBeUndefined();
    await expect(checkRateLimit(config)).resolves.toBeUndefined();
    await expect(checkRateLimit(config)).resolves.toBeUndefined();
  });

  it('rejects the request that exceeds the limit', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await checkRateLimit(config);

    await expect(checkRateLimit(config)).rejects.toThrow(/too many requests/i);
  });

  it('surfaces a custom message when provided', async () => {
    const custom = { ...config, limit: 1, message: 'Slow down, please wait.' };
    await checkRateLimit(custom);

    await expect(checkRateLimit(custom)).rejects.toThrow('Slow down, please wait.');
  });

  it('counts each subject independently', async () => {
    await checkRateLimit({ ...config, key: 'test:alice', limit: 1 });

    // Bob is unaffected by Alice hitting her limit.
    await expect(checkRateLimit({ ...config, key: 'test:bob', limit: 1 }))
      .resolves.toBeUndefined();
    await expect(checkRateLimit({ ...config, key: 'test:alice', limit: 1 }))
      .rejects.toThrow();
  });

  it('resets once the window has elapsed', async () => {
    const windowConfig = { key: 'test:window', limit: 1, windowSeconds: 60 };
    await checkRateLimit(windowConfig);
    await expect(checkRateLimit(windowConfig)).rejects.toThrow();

    // Age the bucket past its window.
    const documents = firestoreMock.dump(COLLECTIONS.RATE_LIMITS);
    const [documentId] = Object.keys(documents);
    firestoreMock.seed(COLLECTIONS.RATE_LIMITS, documentId, {
      ...documents[documentId],
      window_start: Date.now() - 61_000,
    });

    await expect(checkRateLimit(windowConfig)).resolves.toBeUndefined();
  });

  it('stores the key hashed, never the raw email, and sets an expiry for TTL', async () => {
    await checkRateLimit({ key: 'otp:send:student@college.edu', limit: 3, windowSeconds: 600 });

    const [documentId, document] = Object.entries(
      firestoreMock.dump(COLLECTIONS.RATE_LIMITS),
    )[0];

    // The document ID is a sha256 digest, so it is path-safe and non-reversible.
    expect(documentId).toMatch(/^[a-f0-9]{64}$/);
    expect(documentId).not.toContain('@');
    expect(document.expires_at).toBeInstanceOf(Date);
  });
});

describe('pre-configured limits', () => {
  it('allows three OTP sends per email then blocks the fourth', async () => {
    const email = 'student@college.edu';
    await RateLimits.sendOtp(email);
    await RateLimits.sendOtp(email);
    await RateLimits.sendOtp(email);

    await expect(RateLimits.sendOtp(email)).rejects.toThrow(/wait 10 minutes/i);
  });

  it('allows three OTP verification attempts then blocks', async () => {
    const email = 'student@college.edu';
    await RateLimits.verifyOtp(email);
    await RateLimits.verifyOtp(email);
    await RateLimits.verifyOtp(email);

    await expect(RateLimits.verifyOtp(email)).rejects.toThrow(/request a new OTP/i);
  });

  it('keeps send and verify budgets separate', async () => {
    const email = 'student@college.edu';
    for (let attempt = 0; attempt < 3; attempt += 1) await RateLimits.sendOtp(email);

    // Exhausting sends must not lock the user out of verifying a code they have.
    await expect(RateLimits.verifyOtp(email)).resolves.toBeUndefined();
  });

  it('caps daily connection requests', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await RateLimits.connectRequest('user-1');
    }

    await expect(RateLimits.connectRequest('user-1'))
      .rejects.toThrow(/daily connection request limit/i);
  });

  it('caps report submissions', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await RateLimits.reportUser('user-1');

    await expect(RateLimits.reportUser('user-1')).rejects.toThrow(/too many reports/i);
  });

  it('caps profile updates per hour', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) await RateLimits.updateProfile('user-1');

    await expect(RateLimits.updateProfile('user-1'))
      .rejects.toThrow(/too many profile updates/i);
  });

  it('caps message sending per hour', async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) await RateLimits.sendMessage('user-1');

    await expect(RateLimits.sendMessage('user-1')).rejects.toThrow(/rate limit reached/i);
  });
});
