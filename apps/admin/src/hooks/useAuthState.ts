import { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

const isAuthorizedRole = (role: unknown) => role === 'admin' || role === 'moderator';

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          setUser(null);
          return;
        }

        const tokenResult = await u.getIdTokenResult(true);
        const role = tokenResult.claims.role;

        if (!isAuthorizedRole(role)) {
          await signOut(auth);
          setUser(null);
          return;
        }

        setUser(u);
      } catch (error) {
        console.error('Failed to validate admin authorization:', error);
        await signOut(auth);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return { user, loading };
}
