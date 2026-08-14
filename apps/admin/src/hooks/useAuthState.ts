import { useEffect, useState } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '../services/firebase';

export type AdminRole = 'admin' | 'moderator';

interface AuthState {
  user: User | null;
  role: AdminRole | null;
  loading: boolean;
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true });

  useEffect(() => {
    let active = true;
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        if (active) setState({ user: null, role: null, loading: false });
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        const claim = token.claims.role;
        const role = claim === 'admin' || claim === 'moderator' ? claim : null;
        if (active) setState({ user, role, loading: false });
      } catch {
        if (active) setState({ user: null, role: null, loading: false });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
