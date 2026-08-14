import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  Flag,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { describeError, getDashboardStats } from '../services/adminService';
import { StatsCard } from '../components/StatsCard';
import { Badge } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';
import type { StaffRole } from '../hooks/useAuthState';

type RecentVerification = {
  id: string;
  student_name: string;
  college_name: string;
  submitted_at: string | null;
};

/** "+12%" / "-4%" / "no change" from a real computed percentage. */
function trendLabel(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0) {
    return current > 0
      ? { text: `+${current} this week`, direction: 'up' }
      : { text: 'No signups yet', direction: 'flat' };
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { text: 'Flat week on week', direction: 'flat' };
  return {
    text: `${change > 0 ? '+' : ''}${change}% vs last week`,
    direction: change > 0 ? 'up' : 'down',
  };
}

export default function DashboardPage({ role }: { role: StaffRole }) {
  const { data: stats, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 120_000,
  });

  const signupTrend = stats
    ? trendLabel(stats.new_students_7d, stats.new_students_prev_7d)
    : null;

  const columns: Column<RecentVerification>[] = [
    { header: 'Student', accessor: (row) => <span className="font-semibold">{row.student_name}</span> },
    { header: 'College', accessor: (row) => <span className="text-muted text-sm">{row.college_name}</span> },
    { header: 'Submitted', accessor: (row) => <span className="text-muted text-sm">{row.submitted_at ?? '—'}</span> },
    { header: 'Status', accessor: () => <Badge variant="warning">Pending</Badge> },
    {
      header: '',
      accessor: () => (
        <Link className="btn btn-outline btn-sm" to="/verification">Review</Link>
      ),
      width: '110px',
    },
  ];

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Dashboard</h1>
        <div className="header-actions">
          <span className="text-muted text-sm hide-sm">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{describeError(error, 'The dashboard could not be loaded.')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        <div className="stats-grid">
          <StatsCard
            label="Total students" value={stats?.total_students} icon="👥" color="#6C63FF"
            change={signupTrend?.text} direction={signupTrend?.direction} isLoading={isLoading}
          />
          <StatsCard
            label="Pending verification" value={stats?.pending_verification} icon="⏳" color="#F59E0B"
            change={stats?.pending_verification ? 'Needs review' : 'Queue clear'}
            direction={stats?.pending_verification ? 'down' : 'up'} isLoading={isLoading}
          />
          <StatsCard
            label="Verified students" value={stats?.verified_students} icon="✅" color="#22C55E"
            change={
              stats && stats.total_students > 0
                ? `${Math.round((stats.verified_students / stats.total_students) * 100)}% of accounts`
                : undefined
            }
            direction="up" isLoading={isLoading}
          />
          <StatsCard
            label="Active connections" value={stats?.active_matches} icon="🤝" color="#E91E63"
            change={stats ? `+${stats.new_matches_today} today` : undefined}
            direction={stats?.new_matches_today ? 'up' : 'flat'} isLoading={isLoading}
          />
          <StatsCard
            label="Approved colleges" value={stats?.total_colleges} icon="🏫" color="#3B82F6"
            change={stats?.pending_colleges ? `${stats.pending_colleges} awaiting approval` : 'All reviewed'}
            direction={stats?.pending_colleges ? 'down' : 'up'} isLoading={isLoading}
          />
          <StatsCard
            label="Open reports" value={stats?.open_reports} icon="🚨" color="#EF4444"
            change={stats?.open_reports ? 'Needs action' : 'Nothing outstanding'}
            direction={stats?.open_reports ? 'down' : 'up'} isLoading={isLoading}
          />
        </div>

        {stats && stats.suspended_students > 0 && (
          <div className="alert alert-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              {stats.suspended_students} account
              {stats.suspended_students === 1 ? ' is' : 's are'} currently suspended.
            </span>
            <Link className="btn btn-outline btn-sm" to="/users">Review users</Link>
          </div>
        )}

        <div className="card mt-4">
          <h3 style={{ marginBottom: 14 }}>Quick actions</h3>
          <div className="action-row">
            {/* Client-side links: raw <a href> navigated outside the /admin
                basename and triggered a full reload. */}
            <Link to="/verification" className="btn btn-primary btn-sm">
              <ShieldCheck size={15} aria-hidden="true" /> Review verifications
              {stats?.pending_verification ? <span className="btn-count">{stats.pending_verification}</span> : null}
            </Link>
            <Link to="/reports" className="btn btn-danger btn-sm">
              <Flag size={15} aria-hidden="true" /> Review reports
              {stats?.open_reports ? <span className="btn-count">{stats.open_reports}</span> : null}
            </Link>
            {role === 'admin' && (
              <Link to="/colleges" className="btn btn-outline btn-sm">
                <Building2 size={15} aria-hidden="true" /> Manage colleges
              </Link>
            )}
            <Link to="/analytics" className="btn btn-outline btn-sm">
              <TrendingUp size={15} aria-hidden="true" /> View analytics
            </Link>
          </div>
        </div>

        <div className="card mt-4">
          <div className="card-head">
            <h3>Oldest pending verifications</h3>
            <Link to="/verification" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          <DataTable<RecentVerification>
            columns={columns}
            data={stats?.recent_verifications ?? []}
            isLoading={isLoading}
            emptyMessage="No pending verifications — the queue is clear."
            keyExtractor={(row) => row.id}
          />
        </div>
      </div>
    </div>
  );
}
