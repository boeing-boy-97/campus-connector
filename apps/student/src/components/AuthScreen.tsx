import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../services/firebase';
import { OtpInput } from './OtpInput';
import { formatErrorMessage } from '../utils/errors';

const RESEND_COOLDOWN_SECONDS = 30;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2
    ? `${local[0]}***${local[local.length - 1]}`
    : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [collegeName, setCollegeName] = useState('');

  // Countdown timer effect
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const requestOtp = async (targetEmail: string) => {
    setBusy(true);
    setError('');
    try {
      const sendOtpFn = httpsCallable<
        { email: string; consent_given: boolean; consent_version: string },
        { success: boolean; data: { otp_sent?: boolean; college_name?: string; masked_email?: string } }
      >(functions, 'sendOtp');

      const result = await sendOtpFn({
        email: targetEmail.trim().toLowerCase(),
        consent_given: true,
        consent_version: '1.0.0',
      });

      const data = result.data.data;

      if (!data.otp_sent) {
        setError('This email domain is not registered. Please use your official college institutional email.');
        return false;
      }

      if (data.college_name) {
        setCollegeName(data.college_name);
      }

      setStep('otp');
      setResendTimer(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch (e) {
      setError(formatErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    await requestOtp(email);
  };

  const [verifying, setVerifying] = useState(false);

  const handleVerifyOtp = useCallback(async (otpToVerify: string) => {
    if (otpToVerify.length !== 6 || verifying) return;
    setVerifying(true);
    setBusy(true);
    setError('');

    try {
      const verifyOtpFn = httpsCallable<
        { email: string; otp: string },
        { success: boolean; data: { custom_token: string } }
      >(functions, 'verifyOtp');

      const result = await verifyOtpFn({
        email: email.trim().toLowerCase(),
        otp: otpToVerify,
      });

      await signInWithCustomToken(auth, result.data.data.custom_token);
    } catch (e) {
      setError(formatErrorMessage(e));
      setBusy(false);
      setVerifying(false);
    }
  }, [email, verifying]);

  const handleResendOtp = async () => {
    if (resendTimer > 0 || busy) return;
    setOtp('');
    await requestOtp(email);
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">C</div>
        <p className="eyebrow">COLLEGE-VERIFIED COMMUNITY</p>
        <h1>
          Meet your campus,<br />
          <em>for real.</em>
        </h1>
        <p className="auth-copy">
          Campus Connect is a private space for verified students to find collaborators, friends, and meaningful campus connections.
        </p>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} noValidate>
            <label htmlFor="email-input">
              College institutional email
              <input
                id="email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                required
                disabled={busy}
              />
            </label>
            <button type="submit" className="primary" disabled={busy || !email.trim()}>
              {busy ? (
                <>
                  <span className="button-spinner" /> Sending code…
                </>
              ) : (
                <>
                  Continue with email <span>→</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="otp-verification-step">
            <button
              type="button"
              className="back"
              onClick={() => {
                setStep('email');
                setOtp('');
                setError('');
              }}
              disabled={busy}
            >
              ← Change email
            </button>

            <div className="otp-header-info">
              <p className="otp-sent-to">
                Verification code sent to <strong>{maskEmail(email)}</strong>
              </p>
              {collegeName && <p className="college-badge">🏫 {collegeName}</p>}
            </div>

            <div className="otp-form-group">
              <label>Enter 6-digit verification code</label>
              <OtpInput
                value={otp}
                onChange={setOtp}
                onComplete={handleVerifyOtp}
                disabled={busy}
              />
            </div>

            <button
              type="button"
              className="primary"
              onClick={() => handleVerifyOtp(otp)}
              disabled={busy || otp.length !== 6}
            >
              {busy ? (
                <>
                  <span className="button-spinner" /> Verifying…
                </>
              ) : (
                <>
                  Verify and continue <span>→</span>
                </>
              )}
            </button>

            <div className="resend-section">
              {resendTimer > 0 ? (
                <p className="cooldown-text">
                  Resend code available in <strong>{resendTimer}s</strong>
                </p>
              ) : (
                <button
                  type="button"
                  className="text-button resend-btn"
                  onClick={handleResendOtp}
                  disabled={busy}
                >
                  Resend verification code ↻
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="form-error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <p className="legal">
          By continuing, you agree to our Community Guidelines and Privacy Policy. Only approved college domains can join.
        </p>
      </section>
    </main>
  );
}
