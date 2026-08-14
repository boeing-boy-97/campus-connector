import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { auth } from '../services/firebase';

/** Maps Firebase auth error codes to messages that do not leak account existence. */
function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes before trying again.';
      case 'auth/network-request-failed':
        return 'Could not reach the authentication service. Check your connection.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/invalid-email':
        return 'Enter a valid e-mail address.';
      default:
        // Deliberately generic: distinguishing "wrong password" from "no such
        // user" would let an attacker enumerate staff accounts.
        return 'Invalid e-mail or password.';
    }
  }
  return 'Sign-in failed. Please try again.';
}

const STAFF_ROLES = ['admin', 'moderator'];

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If a staff session already exists, skip the form.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    let active = true;
    void user.getIdTokenResult()
      .then((token) => {
        if (!active) return;
        if (STAFF_ROLES.includes(String(token.claims.role))) {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch(() => undefined);

    return () => { active = false; };
  }, [navigate]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Force-refresh so a freshly granted role is visible immediately.
      const token = await credential.user.getIdTokenResult(true);
      const role = String(token.claims.role ?? '');

      if (!STAFF_ROLES.includes(role)) {
        await signOut(auth);
        setError(
          'This account does not have administrator or moderator access. '
          + 'Ask an administrator to grant a staff role.',
        );
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">CC</div>
          <h1>Campus Connect</h1>
          <p className="text-muted">Administration &amp; moderation</p>
        </div>

        <div className="card login-card">
          <h2 style={{ marginBottom: 20 }}>Sign in</h2>

          {error && (
            <div className="alert alert-danger" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="email">E-mail address</label>
              <input
                id="email"
                className="form-input"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@campusconnect.app"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="form-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
              disabled={loading || !email.trim() || !password}
            >
              {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="login-note">
          <ShieldCheck size={14} aria-hidden="true" />
          Restricted access. All actions in this panel are recorded in the audit log.
        </p>
      </div>
    </div>
  );
}
