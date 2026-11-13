/**
 * Auth error-message regression check.
 *
 * Every failure a student can hit while signing in must produce a calm,
 * actionable sentence — never a raw SDK string such as
 * "Firebase: Error (auth/internal-error)." This script exercises
 * `formatErrorMessage` directly and fails on any regression.
 *
 * Run:  npm --prefix apps/student run test:errors
 * (Dependency-free: uses Node's built-in strip-types support, Node >= 22.6.)
 */

import { formatErrorMessage } from '../../src/utils/errors.ts';

const makeError = (code, message = `Firebase: Error (${code}).`) =>
  Object.assign(new Error(message), { code });

/** [code, expected message] — '' means "stay silent" (user-initiated). */
const CASES = [
  ['auth/internal-error', 'Google sign-in could not be completed. Please try again, or use your college email.'],
  ['auth/popup-blocked', 'Pop-up was blocked by your browser. Please allow pop-ups and try again.'],
  ['auth/popup-closed-by-user', ''],
  ['auth/cancelled-popup-request', ''],
  ['auth/unauthorized-domain', 'This domain is not authorised for Google sign-in. Please use your college email instead, or contact support.'],
  ['auth/operation-not-allowed', 'This sign-in method is currently unavailable. Please use your college email instead.'],
  ['auth/web-storage-unsupported', 'Your browser is blocking the sign-in storage. Try a normal (non-private) window, or use your college email.'],
  ['auth/email-already-in-use', 'An account already exists for this email with a different sign-in method. Please use that method.'],
  ['auth/account-exists-with-different-credential', 'An account already exists with this email using a different sign-in method. Try signing in with email.'],
  ['auth/network-request-failed', 'Unable to connect. Please check your internet connection and try again.'],
  ['auth/too-many-requests', 'Too many attempts. Please wait a few minutes before trying again.'],
  ['auth/invalid-domain', 'This email domain is not registered. Please use your official college institutional email.'],
  ['auth/otp-expired', 'This OTP has expired. Please request a new one.'],
  ['auth/otp-invalid', 'That OTP is incorrect. Please check the code and try again.'],
  ['auth/otp-max-attempts', 'Too many incorrect attempts. Please request a new OTP.'],
  ['auth/otp-rate-limit', 'Too many attempts. Please wait a few minutes before trying again.'],
  ['auth/user-suspended', 'Your account has been suspended. Please contact support.'],
  // Unknown/new codes must still degrade to a safe sentence.
  ['auth/some-future-code', 'Sign-in could not be completed. Please try again, or use your college email.'],
];

let failures = 0;

for (const [code, expected] of CASES) {
  const actual = formatErrorMessage(makeError(code));
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL  ${code}\n      expected: ${JSON.stringify(expected)}\n      actual  : ${JSON.stringify(actual)}`);
  } else {
    console.log(`pass  ${code}`);
  }
}

// No message may ever leak a raw SDK/Firebase string to a student.
const leaked = CASES
  .map(([code]) => formatErrorMessage(makeError(code)))
  .filter((msg) => /Firebase|auth\/|INTERNAL/.test(msg));

if (leaked.length) {
  failures += 1;
  console.error(`FAIL  raw SDK text leaked: ${JSON.stringify(leaked)}`);
}

// Non-Error values must not crash the formatter.
for (const value of [null, undefined, '', 0, {}, []]) {
  const msg = formatErrorMessage(value);
  if (!msg || typeof msg !== 'string') {
    failures += 1;
    console.error(`FAIL  formatErrorMessage(${JSON.stringify(value)}) returned ${JSON.stringify(msg)}`);
  }
}

console.log(failures === 0 ? '\nAll auth error messages OK' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
