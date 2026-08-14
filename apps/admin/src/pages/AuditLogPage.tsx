import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Search, X } from 'lucide-react';
import { describeError, getAuditLog, type AuditEntry } from '../services/adminService';
import { Badge, type BadgeVariant } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';

/** Human labels and severity for each audited action. */
const ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  verification_approve: { label: 'Verification approved', variant: 'success' },
  verification_reject: { label: 'Verification rejected', variant: 'danger' },
  suspend_user: { label: 'User suspended', variant: 'danger' },
  reinstate_user: { label: 'User reinstated', variant: 'success' },
  delete_account: { label: 'Account deleted', variant: 'neutral' },
  create_college: { label: 'College created', variant: 'info' },
  approve_college: { label: 'College approved', variant: 'success' },
  reject_college: { label: 'College rejected', variant: 'danger' },
  report_action_taken: { label: 'Report actioned', variant: 'warning' },
  report_dismissed: { label: 'Report dismissed', variant: 'neutral' },
  send_email: { label: 'E-mail sent', variant: 'info' },
  send_push_notification: { label: 'Notification sent', variant: 'info' },
};

function describeAction(action: string) {
  return ACTION_META[action] ?? { label: action.replace(/_/g, ' '), variant: 'neutral' as BadgeVariant };
}

/** Renders a details object compactly without dumping raw JSON at the user. */
function DetailSummary({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return <span className="text-muted">—</span>;

  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== '');
  if (entries.length === 0) return <span className="text-muted">—</span>;

  return (
    <ul className="detail-summary">
      {entries.map(([key, value]) => (
        <li key={key}>
          <span className="text-xs text-muted">{key.replace(/_/g, ' ')}: </span>
          <span className="text-sm">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Immutable record of every privileged action.
 *
 * `audit_logs` was written by the backend and already readable by admins in the
 * security rules, but nothing in the panel ever displayed it — so the audit trail
 * existed without being reviewable.
 */
export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => getAuditLog(100),
    staleTime: 60_000,
  });

  const actionOptions = useMemo(() => {
    const actions = new Set((data ?? []).map((entry) => entry.action));
    return [...actions].sort();
  }, [data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data ?? []).filter((entry) => {
      if (action && entry.action !== action) return false;
      if (!needle) return true;
      return [entry.admin_name, entry.admin_id, entry.target_id, entry.action]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data, search, action]);

  const columns: Column<AuditEntry>[] = [
    {
      header: 'When',
      accessor: (entry) => <span className="text-sm text-muted">{entry.created_at ?? '—'}</span>,
      width: '170px',
    },
    {
      header: 'Action',
      accessor: (entry) => {
        const meta = describeAction(entry.action);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      header: 'Performed by',
      accessor: (entry) => (
        <div style={{ minWidth: 0 }}>
          <div className="font-semibold truncate">{entry.admin_name}</div>
          <code className="inline-code">{entry.admin_id.slice(0, 10)}…</code>
        </div>
      ),
    },
    {
      header: 'Target',
      accessor: (entry) => (
        <div style={{ minWidth: 0 }}>
          <code className="inline-code">{entry.target_id.slice(0, 14)}…</code>
          <div className="text-xs text-muted">{entry.target_collection}</div>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      header: 'Details',
      accessor: (entry) => <DetailSummary details={entry.details} />,
      hideOnMobile: true,
    },
  ];

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Audit log</h1>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} /> {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="page-body">
        <p className="text-sm text-muted" style={{ marginBottom: 16, lineHeight: 1.6, maxWidth: '70ch' }}>
          Every privileged action — verification decisions, suspensions, college changes, report
          outcomes and outbound messages — is recorded here. Entries are written by Cloud Functions
          and cannot be edited or deleted from any client.
        </p>

        {isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{describeError(error, 'The audit log could not be loaded.')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        <div className="toolbar">
          <div className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              className="form-input"
              type="search"
              placeholder="Search by administrator, target ID or action"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search the audit log"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="form-group" style={{ margin: 0, minWidth: 190 }}>
            <label className="sr-only" htmlFor="audit-action">Filter by action</label>
            <select
              id="audit-action"
              className="form-input"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="">All actions</option>
              {actionOptions.map((option) => (
                <option key={option} value={option}>{describeAction(option).label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <DataTable<AuditEntry>
            columns={columns}
            data={rows}
            isLoading={isLoading}
            caption="Administrative audit log"
            emptyMessage={
              search || action
                ? 'No entries match these filters.'
                : 'No administrative actions have been recorded yet.'
            }
            keyExtractor={(entry) => entry.id}
          />
        </div>
      </div>
    </div>
  );
}
