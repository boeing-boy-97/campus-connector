import { generateOtp, hashOtp, maskEmail, verifyOtpHash } from './utils/otp.utils';

describe('OTP utilities', () => {
  it('generates a valid six-digit code', () => {
    const otp = generateOtp();

    expect(otp).toMatch(/^\d{6}$/);
  });

  it('hashes and verifies OTP securely', async () => {
    const otp = '123456';
    const hash = await hashOtp(otp);

    expect(hash).not.toBe(otp);
    await expect(verifyOtpHash(otp, hash)).resolves.toBe(true);
    await expect(verifyOtpHash('654321', hash)).resolves.toBe(false);
  });

  it('masks email addresses safely', () => {
    expect(maskEmail('student@examplecollege.edu.in')).toBe('s***t@examplecollege.edu.in');
  });
});
