import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle, Flag, XCircle } from 'lucide-react';
import {
  describeError,
  getReports,
  reviewReport,
  suspendUser,
  type SafetyReport,
} from '../services/adminService';
import { Badge, StatusBadge } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment',
  fake_profile: 'Fake profile',
  inappropriate_content: 'Inappropriate content',
  spam: 'Spam or scam',
  other: 'Other',
};

const CATEGORY_LABELS: Record<string, string> = {
  profile: 'Profile',
  chat: 'Conversation',
  photo: 'Photo',
  other: 'Other',
};

/**
 * Safety report review.
 *
 * The original page sent a hardcoded note ("User warned or suspended after
 * moderator review.") and could not actually act on the reported account, so
 * "Action taken" changed nothing about the offender. A moderator can now record
 * a real note and, in the same flow, suspend the reported student.
 */
export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<SafetyReport | null>(null);
  const [dismissing, setDismissing] = useState<SafetyReport | null>(null);
  const [formError, setFormError] = useState('');

  const { data: reports, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports'],
    queryFn: getReports,
    refetchInterval: 120_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['pendingCounts'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const resolve = useMutation({
    mutationFn: async (input: {
      report: SafetyReport;
      status: 'action_taken' | 'dismissed';
      notes?: string;
      suspend: boolean;
    }) => {
      // Suspend first: if it fails, the report stays open so the case is not
      // silently closed without the enforcement action being applied.
      if (input.suspend) {
        await suspendUser(
          input.report.reported_id,
          input.notes || `Suspended following report ${input.report.id}.`,
        );
      }
      return reviewReport(input.report.id, input.status, input.notes);
    },
    onSuccess: () => {
      invalidate();
      setActing(null);
      setDismissing(null);
      setFormError('');
    },
    onError: (mutationError) =>
      setFormError(describeError(mutationError, 'The report could not be reviewed.')),
  });

  const submitAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acting) return;

    const form = new FormData(event.currentTarget);
    const notes = String(form.get('notes') ?? '').trim();
    const shouldSuspend = form.get('suspend') === 'on';

    if (notes.length < 5) {
      setFormError('Describe the action taken (at least 5 characters) — it is recorded in the audit log.');
      return;
    }

    setFormError('');
    resolve.mutate({ report: acting, status: 'action_taken', notes, suspend: shouldSuspend });
  };

  const columns: Column<SafetyReport>[] = [
    {
      header: 'Reported student',
      accessor: (report) => (
        <div style={{ minWidth: 0 }}>
          <div className="font-semibold truncate">{report.reported_name}</div>
          <div className="text-xs text-muted truncate">{report.reported_email}</div>
          <StatusBadge status={report.reported_status} />
        </div>
      ),
    },
    {
      header: 'Reported by',
      accessor: (report) => <span className="text-sm text-muted">{report.reporter_name}</span>,
      hideOnMobile: true,
    },
    {
      header: 'Reason',
      accessor: (report) => (
        <div className="stack-2">
          <Badge variant="danger">{REASON_LABELS[report.reason] ?? report.reason}</Badge>
          <span className="text-xs text-muted">
            {CATEGORY_LABELS[report.category] ?? report.category}
          </span>
        </div>
      ),
    },
    {
      header: 'Detail',
      accessor: (report) => (
        <span className="text-sm report-description">{report.description || '—'}</span>
      ),
      hideOnMobile: true,
    },
    {
      header: 'Filed',
      accessor: (report) => <span className="text-sm text-muted">{report.created_at ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      header: 'Actions',
      accessor: (report) => (
        <div className="action-row">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={resolve.isPending}
            onClick={() => { setActing(report); setFormError(''); }}
          >
            <CheckCircle size={14} /> Take action
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={resolve.isPending}
            onClick={() => { setDismissing(report); setFormError(''); }}
          >
            <XCircle size={14} /> Dismiss
          </button>
        </div>
      ),
      width: '230px',
    },
  ];

  const openCount = reports?.length ?? 0;

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Safety reports</h1>
        <div className="header-actions">
          <Badge variant={openCount > 0 ? 'danger' : 'success'}>
            <Flag size={12} /> {isLoading ? '—' : `${openCount} open`}
          </Badge>
        </div>
      </div>

      <div className="page-body">
        {isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{describeError(error, 'Reports could not be loaded.')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && openCount === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">✅</div>
            <div className="empty-state-title">No open reports</div>
            <p className="text-sm">Every safety report has been reviewed.</p>
            <Link className="btn btn-outline btn-sm mt-4" to="/audit">View audit log</Link>
          </div>
        ) : (
          <div className="card">
            <DataTable<SafetyReport>
              columns={columns}
              data={reports ?? []}
              isLoading={isLoading}
              caption="Open safety reports"
              emptyMessage="No open reports."
              keyExtractor={(report) => report.id}
            />
          </div>
        )}
      </div>

      <Modal
        open={acting !== null}
        title="Record the action taken"
        description={`Closes the report against ${acting?.reported_name ?? ''} and writes an audit entry.`}
        busy={resolve.isPending}
        onClose={() => setActing(null)}
      >
        <form onSubmit={submitAction} noValidate>
          {acting?.description && (
            <div className="alert alert-warning">
              <AlertTriangle size={16} />
              <span><strong>Reported detail:</strong> {acting.description}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="action-notes">What action did you take?</label>
            <textarea
              id="action-notes"
              name="notes"
              className="form-input"
              rows={3}
              maxLength={1000}
              placeholder="e.g. Reviewed the conversation, confirmed harassment, account suspended and reporter informed."
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              required
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              name="suspend"
              defaultChecked={false}
              disabled={acting?.reported_status === 'suspended'}
            />
            <span>
              <strong>Also suspend {acting?.reported_name}</strong>
              <span className="text-xs text-muted" style={{ display: 'block', marginTop: 2 }}>
                {acting?.reported_status === 'suspended'
                  ? 'This account is already suspended.'
                  : 'Signs them out immediately and closes every active connection.'}
              </span>
            </span>
          </label>

          {formError && (
            <div className="alert alert-danger" role="alert">
              <AlertTriangle size={16} /><span>{formError}</span>
            </div>
          )}

          <div className="action-row">
            <button type="submit" className="btn btn-danger" disabled={resolve.isPending}>
              <Ban size={15} /> {resolve.isPending ? 'Saving…' : 'Record action'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setActing(null)}
              disabled={resolve.isPending}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dismissing !== null}
        title="Dismiss this report?"
        description="Use this when no policy was broken. The report is closed and the outcome is audited."
        busy={resolve.isPending}
        onClose={() => setDismissing(null)}
      >
        <p className="text-sm text-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
          No action is taken against {dismissing?.reported_name}. The reporter is not notified.
        </p>
        {formError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} /><span>{formError}</span>
          </div>
        )}
        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={resolve.isPending}
            onClick={() => dismissing && resolve.mutate({
              report: dismissing,
              status: 'dismissed',
              suspend: false,
            })}
          >
            {resolve.isPending ? 'Dismissing…' : 'Dismiss report'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setDismissing(null)}
            disabled={resolve.isPending}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
