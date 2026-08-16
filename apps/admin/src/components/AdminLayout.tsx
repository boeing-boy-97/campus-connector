import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  LayoutDashboard, ShieldCheck, Users, Building2,
  Flag, BarChart3, LogOut, GraduationCap
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getPendingCounts } from '../services/adminService';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Verification Queue', icon: ShieldCheck, path: '/verification', badge: 'verification' },
  { label: 'Users', icon: Users, path: '/users' },
  { label: 'Colleges', icon: Building2, path: '/colleges' },
  { label: 'Reports', icon: Flag, path: '/reports', badge: 'reports' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const { data: counts } = useQuery({
    queryKey: ['pendingCounts'],
    queryFn: getPendingCounts,
    refetchInterval: 30_000, // refresh every 30s
  });

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🎓</div>
          <div>
            <div className="sidebar-logo-text">Campus Connect</div>
            <div className="sidebar-logo-sub">Admin Panel</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(({ label, icon: Icon, path, badge }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {badge && counts?.[badge as keyof typeof counts] ? (
                <span className="nav-badge">{counts[badge as keyof typeof counts]}</span>
              ) : null}
            </NavLink>
          ))}

          <div className="nav-section-label" style={{ marginTop: '16px' }}>Account</div>
          <button className="nav-item" onClick={handleSignOut}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </nav>
      </aside>

      {/* Main */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
