import { useEffect, useState } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '../services/firebase';

/**
 * Roles that may access the admin panel.
 *
 * The backend exposes a moderation surface through `requireModerator`
 * (verification queue, reports, suspensions), so moderators must be able to sign
 * in. The original guard required `role === 'admin'` and signed moderators out
 * with "Access denied", making an entire role unusable.
 */
export type StaffRole = 'admin' | 'moderator';

export interface AuthState {
  user: User | null;
  role: StaffRole | null;
  loading: boolean;
  /** Set when a signed-in user has no staff role. */
  unauthorised: boolean;
}

function readRole(claim: unknown): StaffRole | null {
  return claim === 'admin' || claim === 'moderator' ? claim : null;
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    unauthorised: false,
  });

  useEffect(() => {
    let active = true;

    // onIdTokenChanged (rather than onAuthStateChanged) so a role granted while
    // the session is open is picked up on the next token refresh.
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        if (active) setState({ user: null, role: null, loading: false, unauthorised: false });
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        const role = readRole(token.claims.role);
        if (active) {
          setState({ user, role, loading: false, unauthorised: role === null });
        }
      } catch {
        // A token that cannot be read is treated as no session at all.
        if (active) setState({ user: null, role: null, loading: false, unauthorised: false });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

/** True when the role may perform admin-only (not moderator) actions. */
export function isAdminRole(role: StaffRole | null): boolean {
  return role === 'admin';
}
