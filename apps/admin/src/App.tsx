import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './services/firebase';
import { useAuthState } from './hooks/useAuthState';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';

/**
 * Routes are code-split so the initial admin bundle only carries the shell and
 * login screen; heavier pages (notably Analytics with its charting library) load
 * on demand.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const VerificationPage = lazy(() => import('./pages/VerificationPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const CollegesPage = lazy(() => import('./pages/CollegesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));

function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="full-center" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Signed in but without a staff role: explain and offer a way out. */
function NoAccess() {
  return (
    <div className="full-center">
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 10 }}>No admin access</h2>
        <p className="text-muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
          This account is signed in but does not have an administrator or moderator role.
          Ask an existing administrator to grant one, then sign in again.
        </p>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => void signOut(auth)}
          style={{ justifyContent: 'center', width: '100%' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Requires any staff role. */
function StaffRoute({ children }: { children: ReactNode }) {
  const { user, role, loading, unauthorised } = useAuthState();

  if (loading) return <FullPageLoader label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace />;
  if (unauthorised || !role) return <NoAccess />;
  return <>{children}</>;
}

/** Requires the full administrator role (not moderator). */
function AdminOnlyRoute({ children }: { children: ReactNode }) {
  const { role, loading } = useAuthState();

  if (loading) return <FullPageLoader />;
  if (role !== 'admin') {
    return (
      <div className="page">
        <div className="admin-header"><h1>Restricted</h1></div>
        <div style={{ padding: 24 }}>
          <div className="empty-state">
            <div className="empty-state-title">Administrator access required</div>
            <p className="text-sm">
              This section is limited to full administrators. Your moderator role covers the
              verification queue, reports and user management.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AuthenticatedApp() {
  const { role, user } = useAuthState();
  if (!role) return <FullPageLoader />;

  return (
    <AdminLayout role={role} email={user?.email ?? null}>
      <Suspense fallback={<FullPageLoader label="Loading page" />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage role={role} />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/users" element={<UsersPage role={role} />} />
          <Route
            path="/colleges"
            element={<AdminOnlyRoute><CollegesPage /></AdminOnlyRoute>}
          />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route
            path="/audit"
            element={<AdminOnlyRoute><AuditLogPage /></AdminOnlyRoute>}
          />
          <Route
            path="*"
            element={
              <div className="page">
                <div className="admin-header"><h1>Not found</h1></div>
                <div style={{ padding: 24 }}>
                  <div className="empty-state">
                    <div className="empty-state-title">Page not found</div>
                    <p className="text-sm">That page does not exist in the admin panel.</p>
                  </div>
                </div>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<StaffRoute><AuthenticatedApp /></StaffRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
