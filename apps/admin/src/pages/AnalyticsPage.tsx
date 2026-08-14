import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { describeError, getPlatformAnalytics } from '../services/adminService';
import { StatsCard } from '../components/StatsCard';

const WINDOWS = [7, 30, 90];

const STATUS_COLORS: Record<string, string> = {
  approved: '#22C55E',
  pending: '#F59E0B',
  rejected: '#EF4444',
  suspended: '#A855F7',
};

const MATCH_TYPE_COLORS = ['#6C63FF', '#22C55E', '#3B82F6', '#F59E0B', '#E91E63', '#94A3B8'];

const CHART_AXIS = { stroke: '#5A5A80', fontSize: 11 };

const TOOLTIP_STYLE = {
  background: '#1E1E35',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  fontSize: 12,
  color: '#F0F0FF',
};

/** Short date label for the daily axis, e.g. "14 Aug". */
function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function percentLabel(value: number | null, suffix = ''): string | undefined {
  return value === null ? undefined : `${value > 0 ? '+' : ''}${value}%${suffix}`;
}

/**
 * Platform analytics.
 *
 * This page was previously a placeholder card labelled "Live Data" that showed
 * nothing (and `recharts` was an unused dependency). Every figure and series
 * here comes from the `getPlatformAnalytics` callable, which computes them from
 * Firestore aggregation queries.
 */
export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => getPlatformAnalytics(days),
    staleTime: 120_000,
  });

  const daily = (data?.daily ?? []).map((point) => ({ ...point, label: shortDate(point.date) }));
  const verification = (data?.verification_breakdown ?? []).filter((item) => item.count > 0);
  const matchTypes = data?.match_types ?? [];
  const colleges = data?.top_colleges ?? [];

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Analytics</h1>
        <div className="header-actions">
          <div className="filter-chips" role="group" aria-label="Time window">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                className={`btn btn-sm ${days === window ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDays(window)}
                aria-pressed={days === window}
              >
                {window}d
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh analytics"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{describeError(error, 'Analytics could not be loaded.')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        <div className="stats-grid">
          <StatsCard
            label="Verified students" icon="✅" color="#22C55E"
            value={data?.totals.approved_students} isLoading={isLoading}
            change={percentLabel(data?.rates.verification_rate ?? null, ' of accounts')}
            direction="up"
          />
          <StatsCard
            label="Active connections" icon="🤝" color="#E91E63"
            value={data?.totals.active_matches} isLoading={isLoading}
            change={percentLabel(data?.rates.match_trend_pct ?? null, ' vs previous period')}
            direction={(data?.rates.match_trend_pct ?? 0) >= 0 ? 'up' : 'down'}
          />
          <StatsCard
            label="Request acceptance" icon="📨" color="#6C63FF"
            value={data?.rates.acceptance_rate === null || data?.rates.acceptance_rate === undefined
              ? '—'
              : `${data.rates.acceptance_rate}%`}
            isLoading={isLoading}
            change={data ? `${data.totals.accepted_connect_requests.toLocaleString()} of ${data.totals.total_connect_requests.toLocaleString()}` : undefined}
            direction="flat"
          />
          <StatsCard
            label="New signups" icon="📈" color="#3B82F6"
            value={daily.reduce((sum, point) => sum + point.signups, 0)} isLoading={isLoading}
            change={percentLabel(data?.rates.signup_trend_pct ?? null, ' vs previous period')}
            direction={(data?.rates.signup_trend_pct ?? 0) >= 0 ? 'up' : 'down'}
          />
          <StatsCard
            label="Reports resolved" icon="🛡️" color="#A855F7"
            value={data?.totals.resolved_reports} isLoading={isLoading}
            change={data?.totals.open_reports ? `${data.totals.open_reports} still open` : 'Nothing open'}
            direction={data?.totals.open_reports ? 'down' : 'up'}
          />
          <StatsCard
            label="Approved colleges" icon="🏫" color="#F59E0B"
            value={data?.totals.approved_colleges} isLoading={isLoading}
            change={data?.totals.pending_colleges ? `${data.totals.pending_colleges} pending` : 'All reviewed'}
            direction={data?.totals.pending_colleges ? 'down' : 'up'}
          />
        </div>

        <div className="card mt-4">
          <div className="card-head">
            <h3>Signups and new connections</h3>
            <span className="text-sm text-muted">Last {days} days (UTC)</span>
          </div>
          {isLoading ? (
            <div className="skeleton chart-skeleton" />
          ) : daily.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No activity in this period</div>
              <p className="text-sm">Signups and connections will chart here as students join.</p>
            </div>
          ) : (
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6C63FF" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6C63FF" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="matchFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={CHART_AXIS} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={CHART_AXIS} allowDecimals={false} width={44} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone" dataKey="signups" name="Signups"
                    stroke="#6C63FF" strokeWidth={2} fill="url(#signupFill)"
                  />
                  <Area
                    type="monotone" dataKey="matches" name="New connections"
                    stroke="#22C55E" strokeWidth={2} fill="url(#matchFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="chart-row mt-4">
          <div className="card">
            <div className="card-head"><h3>Verification status</h3></div>
            {isLoading ? (
              <div className="skeleton chart-skeleton" />
            ) : verification.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No students yet</div></div>
            ) : (
              <div className="chart-frame short">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={verification}
                      dataKey="count"
                      nameKey="status"
                      innerRadius="52%"
                      outerRadius="80%"
                      paddingAngle={2}
                    >
                      {verification.map((item) => (
                        <Cell key={item.status} fill={STATUS_COLORS[item.status] ?? '#94A3B8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>Connection types</h3></div>
            {isLoading ? (
              <div className="skeleton chart-skeleton" />
            ) : matchTypes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No connections in this period</div>
              </div>
            ) : (
              <div className="chart-frame short">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={matchTypes} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="type" tick={CHART_AXIS} />
                    <YAxis tick={CHART_AXIS} allowDecimals={false} width={40} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Connections" radius={[6, 6, 0, 0]}>
                      {matchTypes.map((item, index) => (
                        <Cell key={item.type} fill={MATCH_TYPE_COLORS[index % MATCH_TYPE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card mt-4">
          <div className="card-head">
            <h3>Signups by college</h3>
            <span className="text-sm text-muted">Last {days} days</span>
          </div>
          {isLoading ? (
            <div className="skeleton chart-skeleton" />
          ) : colleges.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No signups in this period</div>
              <p className="text-sm">Approve a college to open signups for its e-mail domain.</p>
            </div>
          ) : (
            <div className="chart-frame short">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={colleges}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={CHART_AXIS} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={CHART_AXIS} width={128} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="signups" name="Signups" fill="#6C63FF" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
