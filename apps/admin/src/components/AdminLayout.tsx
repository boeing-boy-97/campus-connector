import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Building2,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { auth } from '../services/firebase';
import { getPendingCounts } from '../services/adminService';
import type { StaffRole } from '../hooks/useAuthState';

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  badge?: 'verification' | 'reports';
  /** Restricts the item to full administrators. */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Verification', icon: ShieldCheck, path: '/verification', badge: 'verification' },
  { label: 'Reports', icon: Flag, path: '/reports', badge: 'reports' },
  { label: 'Users', icon: Users, path: '/users' },
  { label: 'Colleges', icon: Building2, path: '/colleges', adminOnly: true },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Audit log', icon: ScrollText, path: '/audit', adminOnly: true },
];

export interface AdminLayoutProps {
  children: ReactNode;
  role: StaffRole;
  email: string | null;
}

/**
 * Responsive admin shell.
 *
 * The original layout used a fixed 256 px sidebar with a matching
 * `margin-left`, so on any viewport below roughly 900 px the content was pushed
 * off-screen. The sidebar is now a slide-in drawer below the desktop breakpoint.
 */
export default function AdminLayout({ children, role, email }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ['pendingCounts'],
    queryFn: getPendingCounts,
    refetchInterval: 60_000,
    // A failed badge count must not surface as an error screen.
    retry: 1,
  });

  // Close the drawer on navigation so it never covers the new page.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login', { replace: true });
  };

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin');

  return (
    <div className="admin-layout">
      <button
        type="button"
        className={`drawer-scrim${drawerOpen ? ' is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-label="Close navigation"
        tabIndex={drawerOpen ? 0 : -1}
      />

      <aside className={`sidebar${drawerOpen ? ' is-open' : ''}`} aria-label="Admin navigation">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden="true">CC</div>
          <div>
            <div className="sidebar-logo-text">Campus Connect</div>
            <div className="sidebar-logo-sub">
              {role === 'admin' ? 'Administrator' : 'Moderator'}
            </div>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {visibleItems.map(({ label, icon: Icon, path, badge }) => {
            const count = badge ? counts?.[badge] ?? 0 : 0;
            return (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                {count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          {email && <div className="sidebar-user" title={email}>{email}</div>}
          <button type="button" className="nav-item" onClick={() => void handleSignOut()}>
            <LogOut size={18} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="mobile-topbar">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <Menu size={20} />
          </button>
          <span className="mobile-topbar-title">Campus Connect Admin</span>
        </header>

        {children}
      </div>
    </div>
  );
}
