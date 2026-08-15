import {
  generateOtp,
  hashOtp,
  isOtpValid,
  maskEmail,
  otpRecordId,
  verifyOtpHash,
} from './otp.utils';

describe('OTP utilities', () => {
  jest.setTimeout(30000);

  test('generates six numeric digits', () => {
    expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  test('normalizes email addresses before deriving record IDs', () => {
    expect(otpRecordId(' Student@Example.edu ')).toBe(otpRecordId('student@example.edu'));
    expect(otpRecordId('student@example.edu')).toMatch(/^[a-f0-9]{64}$/);
  });

  test('accepts the correct OTP and rejects incorrect or malformed values', async () => {
    const encoded = await hashOtp('123456');

    await expect(verifyOtpHash('123456', encoded)).resolves.toBe(true);
    await expect(verifyOtpHash('654321', encoded)).resolves.toBe(false);
    await expect(verifyOtpHash('123456', 'invalid')).resolves.toBe(false);
  });

  test('enforces expiration and attempt limits', () => {
    expect(isOtpValid({ hash: 'unused', expires_at: new Date(Date.now() + 60_000), attempt_count: 0 }, 5))
      .toBe(true);
    expect(isOtpValid({ hash: 'unused', expires_at: new Date(Date.now() - 1), attempt_count: 0 }, 5))
      .toBe(false);
    expect(isOtpValid({ hash: 'unused', expires_at: new Date(Date.now() + 60_000), attempt_count: 5 }, 5))
      .toBe(false);
  });

  test('masks email addresses', () => {
    expect(maskEmail('student@example.edu')).toBe('s***t@example.edu');
  });
});
