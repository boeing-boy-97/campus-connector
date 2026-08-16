/**
 * Maps raw backend, Firebase, or network errors to clean, user-friendly messages.
 */
export function formatErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';

  // Network / Connection errors
  if (
    message.includes('Failed to fetch') ||
    message.includes('network-request-failed') ||
    message.includes('unavailable')
  ) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }

  // OTP & Domain Error codes
  if (code === 'auth/invalid-domain' || message.includes('domain is not registered')) {
    return 'This email domain is not registered. Please use your official college institutional email.';
  }

  if (code === 'auth/otp-expired' || message.includes('expired')) {
    return 'This OTP has expired. Please request a new one.';
  }

  if (code === 'auth/otp-invalid' || message.includes('incorrect') || message.includes('Invalid OTP')) {
    return 'That OTP is incorrect. Please check the code and try again.';
  }

  if (code === 'auth/otp-max-attempts' || message.includes('Too many incorrect attempts')) {
    return 'Too many incorrect attempts. Please request a new OTP.';
  }

  if (code === 'auth/otp-rate-limit' || code === 'general/rate-limit' || message.includes('Too many OTP requests')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }

  if (code === 'auth/user-suspended' || message.includes('suspended')) {
    return 'Your account has been suspended. Please contact support.';
  }

  if (message.includes('consent')) {
    return 'You must accept the Terms of Service and Privacy Policy to continue.';
  }

  // General fallback - clean technical prefix if present
  const cleaned = message.replace(/^FirebaseError:\s*/, '').replace(/^[a-z-]+\/[a-z-]+:\s*/, '');
  return cleaned || 'Something went wrong. Please try again.';
}
