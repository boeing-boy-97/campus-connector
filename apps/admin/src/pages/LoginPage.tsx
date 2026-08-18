import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useNavigate } from 'react-router-dom';

const isAuthorizedRole = (role: unknown) => role === 'admin' || role === 'moderator';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const tokenResult = await credential.user.getIdTokenResult(true);
      const role = tokenResult.claims.role;

      if (!isAuthorizedRole(role)) {
        await signOut(auth);
        setError('Access denied. This dashboard is restricted to admin and moderator accounts.');
        return;
      }

      navigate('/dashboard');
    } catch (err: unknown) {
      console.error('Admin login failed:', err);
      if (err instanceof Error && 'code' in err) {
        const code = (err as { code?: string }).code;
        const messageMap: Record<string, string> = {
          'auth/invalid-credential': 'The email or password is incorrect.',
          'auth/user-not-found': 'No account exists for that email.',
          'auth/wrong-password': 'The password is incorrect.',
          'auth/too-many-requests': 'Too many login attempts. Please wait a moment and try again.',
          'auth/network-request-failed': 'Network error. Please check your connection and try again.',
        };
        setError(messageMap[code ?? ''] ?? 'Login failed. Please try again.');
        return;
      }
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        backgroundImage:
          'radial-gradient(ellipse at 30% 20%, rgba(108,99,255,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(233,30,99,0.08) 0%, transparent 60%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '0 20px',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: 18,
              background:
                'linear-gradient(135deg, #6C63FF, #E91E63)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              margin: '0 auto 16px',
            }}
          >
            🎓
          </div>

          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            Campus Connect
          </h1>

          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 16,
            }}
          >
            Admin Dashboard
          </p>
        </div>

        <div
          className="card"
          style={{
            padding: 32,
          }}
        >
          <h2
            style={{
              fontSize: 28,
              marginBottom: 24,
            }}
          >
            Sign In
          </h2>

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#EF4444',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label
                className="form-label"
                htmlFor="email"
              >
                Email Address
              </label>

              <input
                id="email"
                className="form-input"
                type="email"
                placeholder="admin@campusconnect.app"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
              />
            </div>

            <div className="form-group">
              <label
                className="form-label"
                htmlFor="password"
              >
                Password
              </label>

              <input
                id="password"
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                marginTop: 8,
                justifyContent: 'center',
              }}
              disabled={loading}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 12,
            textAlign: 'center',
            marginTop: 20,
          }}
        >
          Restricted access. Admin accounts only.
        </p>
      </div>
    </div>
  );
}
