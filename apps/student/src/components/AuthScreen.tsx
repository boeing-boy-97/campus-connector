import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode, SVGProps } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  setPersistence,
  signInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../services/firebase';
import { OtpInput } from './OtpInput';
import { LegalModal } from './LegalModal';
import { BrandMark, BrandWordmark, GoogleMark } from './BrandMark';
import { formatErrorMessage } from '../utils/errors';
import { clearSignedOutFlag } from '../utils/authGuard';
import { LEGAL_VERSION } from '../utils/terms';
import type { LegalDocId } from '../utils/terms';

const OTP_LENGTH = 6;
const LEGAL_VERSION_SENT = LEGAL_VERSION;

// Module-level so an error raised during the Google flow can survive the
// unmount/remount of AuthScreen. When the Google popup signs the user in,
// App.tsx's onAuthStateChanged immediately swaps AuthScreen for the app shell;
// if the backend then rejects the login we sign the user back out and re-mount
// AuthScreen — this store lets that new mount show the reason.
let pendingAuthError: string | null = null;

type Step = 'method' | 'email' | 'otp';
type Mode = 'signin' | 'signup';
type AuthMethod = 'google' | 'email';

/* ── Payload contracts for the auth Cloud Functions (asia-south1) ─────────── */

interface SendOtpResponse {
  success: boolean;
  data: {
    message?: string;
    otp_sent?: boolean;
    masked_email?: string;
    college_name?: string;
    college_short_name?: string;
    expires_in_minutes?: number;
  };
}

interface VerifyOtpResponse {
  success: boolean;
  data: {
    custom_token: string;
    uid?: string;
    has_profile?: boolean;
    college_name?: string;
    is_new_user?: boolean;
  };
}

interface GoogleLinkResponse {
  success: boolean;
  data: {
    uid?: string;
    college_name?: string;
    has_profile?: boolean;
  };
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

function collegeFromDomain(email: string): string {
  const domain = email.split('@')[1];
  if (!domain) return 'your college';
  return domain
    .split('.')[0]
    .replace(/^student$/i, 'your college')
    .toUpperCase();
}

function domainOf(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function readRememberMe(): boolean {
  try {
    return localStorage.getItem('cc:remember-me') !== 'false';
  } catch {
    return true;
  }
}

/* ── Inline icons (stroke inherits currentColor) ─────────────────────────── */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <path d="m3.5 7 7.6 5.1a2 2 0 0 0 2.2 0L21 7" />
  </Icon>
);
const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Icon>
);
const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);
const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </Icon>
);
const CapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m2.5 9.5 9.5-5 9.5 5-9.5 5-9.5-5Z" />
    <path d="M6.5 11.5v4.2c0 1.2 2.5 2.8 5.5 2.8s5.5-1.6 5.5-2.8v-4.2" />
    <path d="M21.5 9.5v5" />
  </Icon>
);
const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.6-3.1 3-5 6-5s5.4 1.9 6 5" />
    <path d="M15.6 5.6a3.2 3.2 0 0 1 0 6" />
    <path d="M17.5 14.8c2 .5 3.3 2.1 3.8 4.7" />
  </Icon>
);
const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V13M12 16.4v.1" />
  </Icon>
);
const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="bp-field-error" id={id} role="alert">
      <AlertIcon size={14} />
      <span>{children}</span>
    </p>
  );
}

interface AuthScreenProps {
  /** Browser field detected at import time — used to pick the best Google flow. */
  initialIsSafari?: boolean;
}

export function AuthScreen({ initialIsSafari = false }: AuthScreenProps) {
  const [step, setStep] = useState<Step>('method');
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState<false | AuthMethod>(false);
  const [error, setError] = useState(() => {
    const pending = pendingAuthError;
    pendingAuthError = null;
    return pending ?? '';
  });

  // Email / OTP flow state
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [collegeName, setCollegeName] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [verifying, setVerifying] = useState(false);

  // Consent & session preferences
  const [consent, setConsent] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(readRememberMe);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const isSafari = initialIsSafari;

  const busyRef = useRef(busy);
  busyRef.current = busy;

  /* ── Escape hatches ─────────────────────────────────────────────────────── */

  // Countdown for the "resend code" control.
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  // Close a modal only while the user is allowed to leave (never mid-request).
  const closeLegal = useCallback(() => setLegalDoc(null), []);

  // Google redirect flows (Safari-safe fallback) come back here.
  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result || cancelled) return;
        const idToken = await result.user.getIdToken();
        const linkFn = httpsCallable<{ id_token: string }, GoogleLinkResponse>(functions, 'loginWithGoogle');
        await linkFn({ id_token: idToken });
        clearSignedOutFlag();
        await result.user.getIdToken(true);
      })
      .catch(async (e: unknown) => {
        if (cancelled) return;
        const code = (e as { code?: string })?.code;
        // Nothing was started (some browsers don't support the flow at all).
        if (code === 'auth/operation-not-supported-in-this-environment') return;

        const message = formatErrorMessage(e);
        setError(message);
        if (auth.currentUser) {
          pendingAuthError = message;
          await signOut(auth).catch(() => {});
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the user starts typing, clear stale errors.
  useEffect(() => {
    if (step === 'email') emailRef.current?.focus();
  }, [step]);

  /* ── Email OTP flow ────────────────────────────────────────────────────── */

  const requestOtp = useCallback(async (targetEmail: string): Promise<boolean> => {
    setBusy('email');
    setError('');
    try {
      const sendOtpFn = httpsCallable<
        { email: string; consent_given: boolean; consent_version: string },
        SendOtpResponse
      >(functions, 'sendOtp');

      const result = await sendOtpFn({
        email: targetEmail.trim().toLowerCase(),
        consent_given: true,
        consent_version: LEGAL_VERSION_SENT,
      });

      const data = result.data.data;

      if (!data.otp_sent) {
        const domain = domainOf(targetEmail);
        setError(
          `We couldn't find an approved college for ${domain ? `“${domain}”` : 'that email'}. Use your official college email, or ask your college to register with Campus Connect.`,
        );
        return false;
      }

      if (data.college_name) setCollegeName(data.college_name);
      setMaskedEmail(data.masked_email ?? maskEmail(targetEmail));
      setStep('otp');
      setOtp('');
      setResendTimer(30);
      return true;
    } catch (e) {
      setError(formatErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailTouched(true);
    if (mode === 'signup' && !consent) return; // Consent gate (button is disabled too).
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      emailRef.current?.focus();
      return;
    }
    await requestOtp(trimmed);
  };

  const handleVerifyOtp = useCallback(
    async (otpToVerify: string) => {
      if (otpToVerify.length !== OTP_LENGTH || verifying || busyRef.current) return;
      setVerifying(true);
      setBusy('email');
      setError('');
      try {
        await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
        try {
          localStorage.setItem('cc:remember-me', keepSignedIn ? 'true' : 'false');
        } catch {
          /* ignore */
        }

        const verifyOtpFn = httpsCallable<{ email: string; otp: string }, VerifyOtpResponse>(functions, 'verifyOtp');
        const result = await verifyOtpFn({ email: email.trim().toLowerCase(), otp: otpToVerify });

        clearSignedOutFlag();
        // onAuthStateChanged in App.tsx swaps this screen for the app shell.
        await signInWithCustomToken(auth, result.data.data.custom_token);
      } catch (e) {
        setError(formatErrorMessage(e));
        setOtp('');
        setBusy(false);
        setVerifying(false);
      }
    },
    [email, keepSignedIn, verifying],
  );

  const handleResend = async () => {
    if (resendTimer > 0 || busy) return;
    setOtp('');
    await requestOtp(email);
  };

  /* ── Google flow ───────────────────────────────────────────────────────── */

  const finishGoogleLink = useCallback(async (user: { getIdToken(force?: boolean): Promise<string> }) => {
    const idToken = await user.getIdToken();
    const linkFn = httpsCallable<{ id_token: string }, GoogleLinkResponse>(functions, 'loginWithGoogle');
    await linkFn({ id_token: idToken });
    clearSignedOutFlag();
    // Force-refresh so the custom claims set by the backend land on this client.
    await user.getIdToken(true);
  }, []);

  const handleGoogleSignIn = async () => {
    if (busy) return;
    setBusy('google');
    setError('');

    try {
      await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
      try {
        localStorage.setItem('cc:remember-me', keepSignedIn ? 'true' : 'false');
      } catch {
        /* ignore */
      }

      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });

      // Popups are blocked or silently swallowed in some in-app browsers and on
      // Safari/iOS; a top-level redirect is the reliable path there.
      if (isSafari) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      await finishGoogleLink(result.user);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;

      // Fall back to a redirect when the popup cannot be used at all.
      // (Some browsers report a blocked/aborted popup as a generic internal error.)
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/web-storage-unsupported' ||
        code === 'auth/internal-error'
      ) {
        try {
          const provider = new GoogleAuthProvider();
          provider.addScope('email');
          provider.addScope('profile');
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          setError(formatErrorMessage(redirectError));
          return;
        }
      }

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError(''); // Intentional dismissal — not an error.
        return;
      }

      const message = formatErrorMessage(e);

      // If sign-in created a Firebase user but the backend link failed, sign out
      // so the user is never left half-authenticated with no Campus Connect
      // account. The message survives the remount via pendingAuthError.
      if (auth.currentUser) {
        pendingAuthError = message;
        await signOut(auth).catch(() => {});
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  /* ── Navigation ────────────────────────────────────────────────────────── */

  const goToEmail = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setEmailTouched(false);
    setStep('email');
  };

  const goBack = () => {
    if (busy) return;
    setStep('method');
    // The control that had focus is about to unmount — land on the heading.
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
    setOtp('');
    setError('');
    setCollegeName('');
    setMaskedEmail('');
    setEmailTouched(false);
    setResendTimer(0);
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setConsent(false);
    setError('');
  };

  /* ── Derived UI state ──────────────────────────────────────────────────── */

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const showEmailError = emailTouched && !emailValid && email.trim().length > 0;
  const googleBusy = busy === 'google';
  const emailBusy = busy === 'email';
  const locked = busy !== false;

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <main className="bp-auth">
      <div className="bp-auth-bg" aria-hidden="true">
        <div className="bp-orb bp-orb-1" />
        <div className="bp-orb bp-orb-2" />
        <div className="bp-orb bp-orb-3" />
      </div>

      <div className="bp-auth-shell">
        {/* ── Story panel ─────────────────────────────────────────────── */}
        <aside className="bp-story">
          <div className="bp-story-brand">
            <BrandMark className="brand-mark-lg" />
            <BrandWordmark animate />
            <span className="bp-sr-only">Campus Connect</span>
          </div>

          <div className="bp-story-copy">
            <p className="bp-eyebrow">COLLEGE-VERIFIED COMMUNITY</p>
            <h1>
              Your campus,
              <br />
              <em>finally in one place.</em>
            </h1>
            <p className="bp-story-sub">
              Meet verified classmates, build projects, and find the people who make
              college worth remembering.
            </p>

            <ul className="bp-value-list">
              <li>
                <span className="bp-value-icon"><CapIcon size={17} /></span>
                <div>
                  <strong>Your college only</strong>
                  <span>Nobody outside your campus can see you.</span>
                </div>
              </li>
              <li>
                <span className="bp-value-icon"><ShieldIcon size={17} /></span>
                <div>
                  <strong>Institutional email, not a form</strong>
                  <span>Every account is tied to a verified college domain.</span>
                </div>
              </li>
              <li>
                <span className="bp-value-icon"><UsersIcon size={17} /></span>
                <div>
                  <strong>Real people, in person</strong>
                  <span>Match for friends, study groups, hackathons and dating.</span>
                </div>
              </li>
            </ul>
          </div>

          <p className="bp-story-foot">
            <LockIcon size={13} /> Encrypted in transit · DPDP Act 2023 compliant
          </p>
        </aside>

        {/* ── Auth card ───────────────────────────────────────────────── */}
        <section className="bp-card" aria-labelledby="bp-card-title">
          {/* Compact brand for narrow screens */}
          <div className="bp-card-brand">
            <BrandMark />
            <BrandWordmark />
          </div>

          <div className="bp-card-body">
            <p className="bp-sr-only" aria-live="polite">
            {step === 'method'
              ? mode === 'signin'
                ? 'Sign in'
                : 'Create account'
              : step === 'email'
                ? 'Enter your college email'
                : 'Enter the verification code sent to your email'}
          </p>

          <div className="bp-head">
              <span className={`bp-chip bp-chip-${mode}`}>{mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</span>
              {step !== 'method' && (
                <button type="button" className="bp-back" onClick={goBack} disabled={locked}>
                  <ArrowLeftIcon size={16} />
                  Back
                </button>
              )}
            </div>

            {/* STEP 1 — choose a sign-in method */}
            {step === 'method' && (
              <div className="bp-step" key={`method-${mode}`}>
                <h2 id="bp-card-title" ref={stepHeadingRef} tabIndex={-1}>
                  {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="bp-sub">
                  {mode === 'signin'
                    ? 'Sign in with your official college credentials.'
                    : 'Join with your college email — it takes about a minute.'}
                </p>

                <button
                  type="button"
                  className="bp-google"
                  onClick={handleGoogleSignIn}
                  disabled={locked}
                  aria-busy={googleBusy}
                >
                  {googleBusy ? <span className="button-spinner bp-spinner-dark" /> : <GoogleMark />}
                  <span>{googleBusy ? 'Opening Google…' : 'Continue with Google'}</span>
                </button>

                <div className="bp-divider">
                  <span>or use your college email</span>
                </div>

                <button
                  type="button"
                  className="bp-email-cta"
                  onClick={() => goToEmail(mode)}
                  disabled={locked}
                >
                  <MailIcon size={19} />
                  <span>Continue with college email</span>
                  <ArrowRightIcon size={17} className="bp-cta-arrow" />
                </button>

                {/* Single confirmed rule that actually applies to this product */}
                <p className="bp-rule">
                  <CapIcon size={16} />
                  <span>
                    Only approved college domains can join.{' '}
                    {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
                    <button
                      type="button"
                      className="bp-rule-link"
                      onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                    >
                      {mode === 'signin' ? 'Create an account' : 'Sign in'}
                    </button>
                  </span>
                </p>
              </div>
            )}

            {/* STEP 2 — college email */}
            {step === 'email' && (
              <div className="bp-step" key="email">
                <h2 id="bp-card-title">{mode === 'signin' ? 'Sign in with email' : 'Join with your college email'}</h2>
                <p className="bp-sub">
                  Enter the email your college gave you — we&rsquo;ll send a 6-digit code to prove it&rsquo;s yours.
                </p>

                <form onSubmit={handleEmailSubmit} noValidate>
                  <div className={`bp-field ${showEmailError ? 'has-error' : ''}`}>
                    <label htmlFor="bp-email">College email address</label>
                    <div className="bp-input-wrap">
                      <MailIcon size={18} className="bp-input-icon" />
                      <input
                        id="bp-email"
                        ref={emailRef}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="you@yourcollege.edu"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value.replace(/\s/g, ''));
                          if (error) setError('');
                        }}
                        onBlur={() => setEmailTouched(true)}
                        disabled={emailBusy}
                        aria-invalid={showEmailError}
                        aria-describedby={showEmailError ? 'bp-email-error' : 'bp-email-hint'}
                        required
                      />
                    </div>
                    {showEmailError ? (
                      <FieldError id="bp-email-error">Enter a valid email address, like you@college.edu.</FieldError>
                    ) : (
                      <p className="bp-hint" id="bp-email-hint">
                        {emailValid ? (
                          <span className="bp-hint-academy">
                            <CapIcon size={14} />
                            <span>
                              Looks like a <strong>{collegeFromDomain(email)}</strong> address — we&rsquo;ll confirm
                              your college on the next step.
                            </span>
                          </span>
                        ) : (
                          'We only accept emails from registered colleges.'
                        )}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="bp-primary"
                    disabled={emailBusy || !email.trim() || (mode === 'signup' && !consent)}
                    aria-describedby={mode === 'signup' && !consent ? 'bp-consent-hint' : undefined}
                  >
                    {emailBusy ? (
                      <>
                        <span className="button-spinner" /> Sending code…
                      </>
                    ) : (
                      <>
                        Send verification code <ArrowRightIcon size={17} />
                      </>
                    )}
                  </button>
                </form>

                {mode === 'signup' && (
                  <ConsentRow
                    consent={consent}
                    onToggle={() => setConsent((c) => !c)}
                    onOpenLegal={setLegalDoc}
                    disabled={emailBusy}
                    hintId="bp-consent-hint"
                  />
                )}
              </div>
            )}

            {/* STEP 3 — OTP */}
            {step === 'otp' && (
              <div className="bp-step" key="otp">
                <div className="bp-otp-top">
                  <span className="bp-flow-icon">
                    <MailIcon size={22} />
                  </span>
                  <button
                    type="button"
                    className="bp-change-email"
                    onClick={() => {
                      if (locked) return;
                      setStep('email');
                      setOtp('');
                      setError('');
                    }}
                    disabled={locked}
                  >
                    Change email
                  </button>
                </div>

                <h2 id="bp-card-title">Check your email</h2>
                <p className="bp-sub">
                  We sent a 6-digit code to <strong className="bp-email-strong">{maskedEmail || maskEmail(email)}</strong>
                </p>
                {collegeName && (
                  <p className="bp-college">
                    <CapIcon size={14} /> {collegeName}
                  </p>
                )}

                <div className="bp-field">
                  <label id="bp-otp-label">Enter your code</label>
                  <OtpInput
                    value={otp}
                    onChange={(next) => {
                      setOtp(next);
                      if (error) setError('');
                    }}
                    onComplete={handleVerifyOtp}
                    disabled={emailBusy}
                    length={OTP_LENGTH}
                  />
                  <p className="bp-hint bp-hint-row">
                    <ClockIcon size={13} /> Codes expire after 5 minutes.
                  </p>
                </div>

                <button
                  type="button"
                  className="bp-primary"
                  onClick={() => handleVerifyOtp(otp)}
                  disabled={emailBusy || otp.length !== OTP_LENGTH}
                >
                  {emailBusy ? (
                    <>
                      <span className="button-spinner" /> Verifying…
                    </>
                  ) : (
                    <>
                      Verify &amp; continue <ArrowRightIcon size={17} />
                    </>
                  )}
                </button>

                <div className="bp-resend">
                  {resendTimer > 0 ? (
                    <p className="bp-resend-timer" aria-live="polite">
                      Didn&rsquo;t get it? You can request a new code in <strong>{resendTimer}s</strong>
                    </p>
                  ) : (
                    <button type="button" className="bp-resend-btn" onClick={handleResend} disabled={locked}>
                      Didn&rsquo;t get it? Send a new code
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Session preference — shown wherever the user is about to sign in */}
            {step !== 'otp' && (
              <label className="bp-check bp-check-session">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  disabled={locked}
                />
                <span className="bp-check-box" aria-hidden="true"><CheckIcon size={12} /></span>
                <span>
                  Keep me signed in on this device
                  <small>Uncheck on shared or lab computers.</small>
                </span>
              </label>
            )}

            {error && (
              <div className="bp-alert" role="alert">
                <AlertIcon size={17} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <footer className="bp-foot">
            <p className="bp-foot-note">
              <LockIcon size={14} />
              <span>
                Your email is used only to verify your college and is never shown to other students.
              </span>
            </p>
            <span className="bp-foot-badge">
              <ShieldIcon size={12} /> Verified campus only
            </span>
            <nav className="bp-foot-legal" aria-label="Legal">
              <button type="button" className="bp-legal-link" onClick={() => setLegalDoc('terms')}>
                Terms of Service
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className="bp-legal-link" onClick={() => setLegalDoc('privacy')}>
                Privacy Policy
              </button>
              <span className="bp-foot-version">v{LEGAL_VERSION}</span>
            </nav>
          </footer>
        </section>
      </div>

      {legalDoc && <LegalModal doc={legalDoc} onClose={closeLegal} />}
    </main>
  );
}

/* ── Consent row (signup only) ───────────────────────────────────────────── */

function ConsentRow({
  consent,
  onToggle,
  onOpenLegal,
  disabled,
  hintId,
}: {
  consent: boolean;
  onToggle: () => void;
  onOpenLegal: (doc: LegalDocId) => void;
  disabled: boolean;
  hintId: string;
}) {
  return (
    <div className={`bp-consent ${consent ? 'is-checked' : ''}`} id={hintId}>
      <label className="bp-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={onToggle}
          disabled={disabled}
          aria-describedby={`${hintId}-copy`}
        />
        <span className="bp-check-box" aria-hidden="true"><CheckIcon size={12} /></span>
        <span className="bp-consent-main">
          <strong>I agree to the Terms of Service and Privacy Policy</strong>
          <small id={`${hintId}-copy`}>
            Read the{' '}
            <button type="button" className="bp-legal-link" onClick={() => onOpenLegal('terms')}>
              Terms
            </button>{' '}
            or{' '}
            <button type="button" className="bp-legal-link" onClick={() => onOpenLegal('privacy')}>
              Privacy Policy
            </button>{' '}
            · version {LEGAL_VERSION}
          </small>
        </span>
      </label>
    </div>
  );
}
