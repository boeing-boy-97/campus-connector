import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

/**
 * Cross-tab sign-out guard.
 *
 * Every Campus Connect account is a college account, so the browser should never
 * keep a Firebase session alive after the person has signed out, deleted their
 * account, or signed in somewhere else. The student app has no `logout()`
 * backend function that revokes refresh tokens, so a check on app boot (and on
 * focus, when the tab has been idle for a while) closes that gap:
 *
 *   1. A local "signed-out on purpose" flag  → sign out immediately.
 *   2. A dead / disabled server-side account → sign out (token refresh fails).
 *
 * The flag is written by `signOutEverywhere()` and cleared by every sign-in path
 * in `AuthScreen`.
 */

export const SIGNED_OUT_FLAG = 'cc:signed-out';

export function markSignedOut(): void {
  try {
    localStorage.setItem(SIGNED_OUT_FLAG, String(Date.now()));
  } catch {
    /* Storage unavailable (private mode) — nothing to persist. */
  }
}

export function clearSignedOutFlag(): void {
  try {
    localStorage.removeItem(SIGNED_OUT_FLAG);
  } catch {
    /* ignore */
  }
}

export function wasSignedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_FLAG) !== null;
  } catch {
    return false;
  }
}

/** Revoke this device's session everywhere — including from other tabs. */
export async function signOutEverywhere(): Promise<void> {
  markSignedOut();
  await signOut(auth);
}

/**
 * Returns true when the signed-in Firebase user is no longer valid on the
 * server (deleted account, disabled user, revoked refresh token).
 */
export async function isSessionDead(user: { getIdToken(forceRefresh?: boolean): Promise<string> }): Promise<boolean> {
  try {
    await user.getIdToken(true);
    return false;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? '';
    return (
      code === 'auth/user-disabled' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-user-token' ||
      code === 'auth/user-token-expired' ||
      code === 'auth/requires-recent-login'
    );
  }
}
