import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import {
  signInWithCustomToken,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../services/firebase';
import { OtpInput } from './OtpInput';
import { formatErrorMessage } from '../utils/errors';

const RESEND_COOLDOWN_SECONDS = 30;

// Module-level so an error raised during the Google flow can survive the
// unmount/remount of AuthScreen. When the Google popup signs the user in,
// App.tsx's onAuthStateChanged immediately swaps AuthScreen for the app shell;
// if the backend then rejects the login we sign the user back out and re-mount
// AuthScreen — this store lets that new mount show the reason.
let pendingAuthError: string | null = null;

type AuthMethod = 'landing' | 'email' | 'google';
type EmailStep = 'input' | 'otp';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal =
    local.length > 2
      ? `${local[0]}***${local[local.length - 1]}`
      : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function AuthScreen() {
  // ── State ───────────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('landing');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [emailStep, setEmailStep] = useState<EmailStep>('input');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const pending = pendingAuthError;
    pendingAuthError = null;
    return pending ?? '';
  });
  const [resendTimer, setResendTimer] = useState(0);
  const [collegeName, setCollegeName] = useState('');
  const [animating, setAnimating] = useState(false);
  const [entering, setEntering] = useState(true);

  // ── Entry animation ─────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), 100);
    return () => clearTimeout(timer);
  }, []);

  // ── Countdown timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(
      () => setResendTimer((p) => p - 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [resendTimer]);

  // ── Navigation helper with animation ────────────────────────────────────
  const navigateTo = useCallback(
    (method: AuthMethod) => {
      setAnimating(true);
      setError('');
      setTimeout(() => {
        setAuthMethod(method);
        setAnimating(false);
      }, 250);
    },
    [],
  );

  const goBack = useCallback(() => {
    setOtp('');
    setEmailStep('input');
    setError('');
    setCollegeName('');
    navigateTo('landing');
  }, [navigateTo]);

  // ══════════════════════════════════════════════════════════════════════
  //  EMAIL OTP FLOW
  // ══════════════════════════════════════════════════════════════════════

  const requestOtp = async (targetEmail: string) => {
    setBusy(true);
    setError('');
    try {
      const sendOtpFn = httpsCallable<
        {
          email: string;
          consent_given: boolean;
          consent_version: string;
        },
        {
          success: boolean;
          data: {
            otp_sent?: boolean;
            college_name?: string;
            masked_email?: string;
          };
        }
      >(functions, 'sendOtp');

      const result = await sendOtpFn({
        email: targetEmail.trim().toLowerCase(),
        consent_given: true,
        consent_version: '1.0.0',
      });

      const data = result.data.data;

      if (!data.otp_sent) {
        setError(
          'This email domain is not registered. Please use your official college institutional email.',
        );
        return false;
      }

      if (data.college_name) setCollegeName(data.college_name);

      setEmailStep('otp');
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

  const handleVerifyOtp = useCallback(
    async (otpToVerify: string) => {
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
    },
    [email, verifying],
  );

  const handleResendEmailOtp = async () => {
    if (resendTimer > 0 || busy) return;
    setOtp('');
    await requestOtp(email);
  };

  // ══════════════════════════════════════════════════════════════════════
  //  GOOGLE SIGN-IN
  // ══════════════════════════════════════════════════════════════════════

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      // Dynamic import to avoid loading Google provider if not needed
      const { GoogleAuthProvider } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      // Link the Google account with the backend, which verifies the college
      // domain and sets the student's custom claims (role, college_id,
      // verification_status). Any failure here (unregistered domain, wrong
      // Firebase project, function unavailable, etc.) is a real login failure
      // and must NOT be silently swallowed.
      const linkFn = httpsCallable<
        { id_token: string },
        { success: boolean; data: { custom_token: string } }
      >(functions, 'loginWithGoogle');

      await linkFn({ id_token: idToken });

      // Force-refresh the ID token so the custom claims the backend just set
      // (role, college_id, verification_status) are present on subsequent calls.
      await result.user.getIdToken(true);
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
        // User intentionally dismissed the popup — not an error.
        setError('');
      } else {
        const message = e?.code === 'auth/popup-blocked'
          ? 'Pop-up was blocked by your browser. Please allow pop-ups and try again.'
          : formatErrorMessage(e);

        // If sign-in created a Firebase user but the backend link failed, sign
        // out so the user is never left half-authenticated with no Campus
        // Connect account. App.tsx re-mounts AuthScreen after sign-out; store
        // the message so that new mount can display it.
        if (auth.currentUser) {
          pendingAuthError = message;
          await signOut(auth).catch(() => {});
        }
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  // NOTE: Phone-number login is intentionally disabled until a complete phone
  // onboarding flow exists (phone verification → college identification →
  // custom claims → student profile provisioning). Firebase phone auth alone
  // cannot produce a Campus Connect student account, so offering it in the UI
  // leaves users authenticated with Firebase but locked out of the app.

  // ══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════

  return (
    <main className={`auth-page ${entering ? 'auth-entering' : ''}`}>
      {/* Decorative background elements */}
      <div className="auth-bg-decoration">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <section
        className={`auth-card ${animating ? 'auth-card-exit' : 'auth-card-enter'}`}
      >
        {/* ─── LANDING: Method Selection ─────────────────────────────── */}
        {authMethod === 'landing' && (
          <div className={`auth-landing auth-landing-${authMode}`}>
            <div className="auth-brand-row">
              <div className="brand-mark brand-mark-animated">C</div>
              <div className="auth-trust-badges">
                <span className="trust-badge">🔒 Encrypted</span>
                <span className="trust-badge">🎓 College-verified</span>
              </div>
            </div>

            {/* Sign In / Sign Up toggles */}
            <div className="auth-mode-selector">
              <button
                type="button"
                className={`auth-mode-tab ${authMode === 'signin' ? 'active' : ''}`}
                onClick={() => setAuthMode('signin')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-mode-tab ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => setAuthMode('signup')}
              >
                Create Account
              </button>
            </div>

            <div className="auth-mode-content">
              <p className="eyebrow">
                {authMode === 'signin' ? 'COLLEGE-VERIFIED COMMUNITY' : 'JOIN CAMPUS CONNECT'}
              </p>
              <h1>
                {authMode === 'signin' ? (
                  <>
                    Welcome back
                    <br />
                    <em>to campus.</em>
                  </>
                ) : (
                  <>
                    Meet your campus,
                    <br />
                    <em>for real.</em>
                  </>
                )}
              </h1>
              <p className="auth-copy">
                {authMode === 'signin'
                  ? 'Sign in with your official credentials to connect with classmates, projects, and events.'
                  : 'A private space for verified students to find collaborators, friends, and meaningful campus connections.'}
              </p>
            </div>

            {/* Google Sign-In */}
            <button
              className="auth-btn auth-btn-google"
              onClick={handleGoogleSignIn}
              disabled={busy}
            >
              <svg className="auth-btn-icon" viewBox="0 0 24 24" width="20" height="20">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {busy ? 'Connecting…' : authMode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
            </button>

            {/* Divider */}
            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            {/* Email */}
            <button
              className="auth-btn auth-btn-email"
              onClick={() => navigateTo('email')}
            >
              <svg className="auth-btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              {authMode === 'signin' ? 'Sign in with Email' : 'Sign up with Email'}
            </button>

            {/* Stats */}
            <div className="auth-stats">
              <div className="auth-stat">
                <strong>10K+</strong>
                <span>Students</span>
              </div>
              <div className="auth-stat-divider" />
              <div className="auth-stat">
                <strong>50+</strong>
                <span>Colleges</span>
              </div>
              <div className="auth-stat-divider" />
              <div className="auth-stat">
                <strong>100%</strong>
                <span>Verified</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── EMAIL OTP FLOW ────────────────────────────────────────── */}
        {authMethod === 'email' && (
          <div className="auth-flow">
            <button
              type="button"
              className="auth-back-btn"
              onClick={goBack}
              disabled={busy}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>

            <div className="auth-flow-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#244c43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>

            {emailStep === 'input' ? (
              <>
                <h2>Sign in with email</h2>
                <p className="auth-flow-desc">
                  Enter your official college email. We'll send a 6-digit
                  verification code.
                </p>

                <form onSubmit={handleEmailSubmit} noValidate>
                  <div className="auth-input-group">
                    <label htmlFor="email-input" className="auth-floating-label">
                      College email address
                    </label>
                    <input
                      id="email-input"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      type="email"
                      autoComplete="email"
                      placeholder="you@college.edu"
                      required
                      disabled={busy}
                      className="auth-input"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="auth-submit-btn"
                    disabled={busy || !email.trim()}
                  >
                    {busy ? (
                      <span className="auth-btn-loading">
                        <span className="button-spinner" /> Sending code…
                      </span>
                    ) : (
                      'Send verification code'
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="auth-back-text"
                  onClick={() => {
                    setEmailStep('input');
                    setOtp('');
                    setError('');
                  }}
                  disabled={busy}
                >
                  ← Change email
                </button>

                <h2>Check your email</h2>

                <div className="auth-email-info">
                  <p className="auth-sent-to">
                    Code sent to{' '}
                    <strong>{maskEmail(email)}</strong>
                  </p>
                  {collegeName && (
                    <p className="college-badge">🏫 {collegeName}</p>
                  )}
                </div>

                <div className="auth-otp-group">
                  <label>Enter 6-digit code</label>
                  <OtpInput
                    value={otp}
                    onChange={setOtp}
                    onComplete={handleVerifyOtp}
                    disabled={busy}
                  />
                </div>

                <button
                  type="button"
                  className="auth-submit-btn"
                  onClick={() => handleVerifyOtp(otp)}
                  disabled={busy || otp.length !== 6}
                >
                  {busy ? (
                    <span className="auth-btn-loading">
                      <span className="button-spinner" /> Verifying…
                    </span>
                  ) : (
                    'Verify & continue'
                  )}
                </button>

                <div className="auth-resend">
                  {resendTimer > 0 ? (
                    <p className="auth-resend-timer">
                      Resend code in <strong>{resendTimer}s</strong>
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="auth-resend-btn"
                      onClick={handleResendEmailOtp}
                      disabled={busy}
                    >
                      Didn't receive it? Send again ↻
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── ERROR BANNER ──────────────────────────────────────────── */}
        {error && (
          <div className="auth-error" role="alert">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* ─── LEGAL FOOTER ──────────────────────────────────────────── */}
        <p className="auth-legal">
          By continuing, you agree to our{' '}
          <a href="#terms" onClick={(e) => e.preventDefault()}>
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#privacy" onClick={(e) => e.preventDefault()}>
            Privacy Policy
          </a>
          . Only approved college domains can join.
        </p>
      </section>
    </main>
  );
}
