import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../services/firebase';
import { api, errorMessage } from '../services/api';
import { Icon } from '../components/Icon';
import { FieldError, Spinner } from '../components/states';
import type { CollegeBranding } from '../types';

const CONSENT_VERSION = '1.0.0';
const PRIVACY_URL = 'https://campusconnect.app/privacy';
const TERMS_URL = 'https://campusconnect.app/terms';
const RESEND_COOLDOWN_SECONDS = 30;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Two-step college e-mail sign-in.
 *
 * Step 1 collects the address and consent, and looks up the college for that
 * domain so the student sees which institution they are joining before
 * committing. Step 2 verifies the six-digit code and exchanges the returned
 * custom token for a Firebase session.
 */
export function AuthScreen() {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState('');
  const [college, setCollege] = useState<CollegeBranding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; consent?: string; otp?: string }>({});
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState('');

  const otpInputRef = useRef<HTMLInputElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Debounced college lookup so the student gets immediate, real feedback about
  // whether their institution is registered — without a request per keystroke.
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    clearTimeout(lookupTimer.current);

    if (!EMAIL_PATTERN.test(trimmed)) {
      setCollege(null);
      return;
    }

    lookupTimer.current = setTimeout(() => {
      void api.checkEmailDomain(trimmed)
        .then((result) => setCollege(result.is_registered ? result.college : null))
        // A failed lookup is non-blocking: sign-in still works, we just cannot
        // show the college name yet.
        .catch(() => setCollege(null));
    }, 450);

    return () => clearTimeout(lookupTimer.current);
  }, [email]);

  const requestCode = useCallback(async (isResend: boolean) => {
    const trimmed = email.trim().toLowerCase();
    const errors: typeof fieldErrors = {};

    if (!EMAIL_PATTERN.test(trimmed)) {
      errors.email = 'Enter a valid e-mail address.';
    }
    if (!consent) {
      errors.consent = 'You must accept the Terms and Privacy Policy to continue.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await api.sendOtp(trimmed, CONSENT_VERSION);
      setStep('otp');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(
        isResend
          ? `A new code was sent to ${result.masked_email}.`
          : `We sent a ${result.expires_in_minutes}-minute code to ${result.masked_email}.`,
      );
      setOtp('');
      // Focus the code field so the flow continues without a manual tap.
      setTimeout(() => otpInputRef.current?.focus(), 60);
    } catch (caught) {
      setError(errorMessage(caught, 'We could not send the verification code.'));
    } finally {
      setBusy(false);
    }
  }, [consent, email]);

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    void requestCode(false);
  };

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (otp.length !== 6) {
      setFieldErrors({ otp: 'Enter the six-digit code from your e-mail.' });
      return;
    }

    setFieldErrors({});
    setBusy(true);
    setError('');

    try {
      const result = await api.verifyOtp(email.trim().toLowerCase(), otp);
      // Signing in triggers onAuthStateChanged, which unmounts this screen.
      await signInWithCustomToken(auth, result.custom_token);
    } catch (caught) {
      setError(errorMessage(caught, 'That code could not be verified.'));
      setOtp('');
      otpInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">C</div>
        <p className="eyebrow">College-verified community</p>

        {step === 'email' ? (
          <>
            <h1 className="display">Meet your campus,<br /><em>for real.</em></h1>
            <p className="lede">
              Campus Connector is a private space for verified students to find collaborators,
              study partners, friends and meaningful connections — only within their own college.
            </p>

            {college && (
              <p className="auth-college">
                {college.logo_url && <img src={college.logo_url} alt="" />}
                <Icon name="shield" size={16} />
                <span>{college.name}</span>
              </p>
            )}

            <form onSubmit={submitEmail} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="auth-email">College e-mail</label>
                <input
                  id="auth-email"
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={fieldErrors.email ? 'true' : undefined}
                  aria-describedby={fieldErrors.email ? 'auth-email-error' : 'auth-email-hint'}
                  required
                />
                <span className="hint" id="auth-email-hint">
                  Use your institutional address. Personal e-mail providers are not accepted.
                </span>
                {fieldErrors.email && (
                  <span id="auth-email-error"><FieldError>{fieldErrors.email}</FieldError></span>
                )}
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  aria-invalid={fieldErrors.consent ? 'true' : undefined}
                />
                <span>
                  I am 18 or older and I agree to the{' '}
                  <a href={TERMS_URL} target="_blank" rel="noreferrer noopener">Terms of Service</a>{' '}
                  and{' '}
                  <a href={PRIVACY_URL} target="_blank" rel="noreferrer noopener">Privacy Policy</a>.
                </span>
              </label>
              {fieldErrors.consent && <FieldError>{fieldErrors.consent}</FieldError>}

              <button type="submit" className="button primary block large" disabled={busy}>
                {busy ? <><Spinner label="Sending code" /> Sending…</> : <>Continue with e-mail <Icon name="send" size={17} /></>}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="display">Check your inbox.</h1>
            <p className="lede">
              Enter the six-digit code we sent to <strong>{email}</strong>.
              It expires in 10 minutes.
            </p>

            <form onSubmit={submitOtp} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="auth-otp">Verification code</label>
                <input
                  id="auth-otp"
                  ref={otpInputRef}
                  className="input otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
                    setFieldErrors({});
                  }}
                  aria-invalid={fieldErrors.otp ? 'true' : undefined}
                  required
                />
                {fieldErrors.otp && <FieldError>{fieldErrors.otp}</FieldError>}
              </div>

              <button type="submit" className="button primary block large" disabled={busy || otp.length !== 6}>
                {busy ? <><Spinner label="Verifying" /> Verifying…</> : <>Verify and sign in <Icon name="check" size={17} /></>}
              </button>

              <div className="row center" style={{ justifyContent: 'center', marginTop: 16 }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void requestCode(true)}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
                <span aria-hidden="true" className="muted">·</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setError('');
                    setNotice('');
                    setFieldErrors({});
                  }}
                  disabled={busy}
                >
                  Use a different e-mail
                </button>
              </div>
            </form>
          </>
        )}

        {notice && !error && (
          <p className="banner info" style={{ marginTop: 18, marginBottom: 0 }}>
            <Icon name="check" size={16} /><span>{notice}</span>
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}

        <p className="legal">
          Your college e-mail is used only to verify that you are a student. We never post
          anything on your behalf, and your profile is visible only to verified students
          from your own college.
        </p>
      </section>
    </main>
  );
}
