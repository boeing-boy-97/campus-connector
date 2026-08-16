import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../services/adminService';
import { Users, ShieldCheck, Heart, Flag, Building2, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 60_000,
  });

  const statCards = [
    { label: 'Total Students', value: stats?.total_students, icon: '👥', color: '#6C63FF', change: '+12% this week' },
    { label: 'Pending Verification', value: stats?.pending_verification, icon: '⏳', color: '#F59E0B', change: 'Needs review' },
    { label: 'Verified Users', value: stats?.verified_students, icon: '✅', color: '#22C55E', change: '+8% this week' },
    { label: 'Active Matches', value: stats?.active_matches, icon: '💞', color: '#E91E63', change: `+${(stats as any)?.new_matches_today || 0} today` },
    { label: 'Colleges', value: stats?.total_colleges, icon: '🏫', color: '#3B82F6', change: 'Registered' },
    { label: 'Open Reports', value: stats?.open_reports, icon: '🚨', color: '#EF4444', change: 'Need action' },
  ];

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Dashboard</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div style={{ padding: 24 }}>
        {/* Stats Grid */}
        <div className="stats-grid">
          {statCards.map(({ label, value, icon, color, change }) => (
            <div className="stat-card" key={label}>
              <div className="stat-icon" style={{ background: `${color}20` }}>
                <span style={{ fontSize: 22 }}>{icon}</span>
              </div>
              <div>
                {isLoading
                  ? <div className="skeleton" style={{ width: 80, height: 32, borderRadius: 4 }} />
                  : <div className="stat-value">{value?.toLocaleString() ?? '—'}</div>}
                <div className="stat-label">{label}</div>
                <div className="stat-change up">{change}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="card mt-4">
          <h3 style={{ marginBottom: 16 }}>Quick Actions</h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <a href="/verification" className="btn btn-primary btn-sm">
              <ShieldCheck size={15} /> Review Verifications
              {stats?.pending_verification ? (
                <span style={{
                  background: 'rgba(255,255,255,0.25)',
                  borderRadius: 12, padding: '2px 8px', fontSize: 12
                }}>{stats.pending_verification}</span>
              ) : null}
            </a>
            <a href="/reports" className="btn btn-danger btn-sm">
              <Flag size={15} /> Review Reports
              {stats?.open_reports ? (
                <span style={{
                  background: 'rgba(255,255,255,0.25)',
                  borderRadius: 12, padding: '2px 8px', fontSize: 12
                }}>{stats.open_reports}</span>
              ) : null}
            </a>
            <a href="/colleges" className="btn btn-outline btn-sm">
              <Building2 size={15} /> Manage Colleges
            </a>
            <a href="/analytics" className="btn btn-outline btn-sm">
              <TrendingUp size={15} /> View Analytics
            </a>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card mt-4">
          <div className="flex justify-between items-center mb-4">
            <h3>Recent Verification Requests</h3>
            <a href="/verification" className="btn btn-ghost btn-sm">View all →</a>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>College</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 16, borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                ) : stats?.recent_verifications?.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No pending verifications 🎉
                    </td>
                  </tr>
                ) : stats?.recent_verifications?.map((v: any) => (
                  <tr key={v.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <img src={v.profile_photo || '/avatar-placeholder.png'} className="avatar" style={{ width: 32, height: 32 }} alt="" />
                        <div>
                          <div className="font-semibold">{v.name}</div>
                          <div className="text-xs text-muted">{v.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-info">{v.college_name}</span></td>
                    <td className="text-muted text-sm">{v.submitted_at}</td>
                    <td><span className="badge badge-warning">Pending</span></td>
                    <td>
                      <a href={`/verification?id=${v.id}`} className="btn btn-primary btn-sm">
                        Review
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
