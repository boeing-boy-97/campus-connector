import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Mail, RotateCcw, Search, Send, X } from 'lucide-react';
import {
  describeError,
  getUsers,
  reinstateUser,
  resendWelcomeEmail,
  sendAnnouncement,
  suspendUser,
  type AdminUser,
} from '../services/adminService';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import type { StaffRole } from '../hooks/useAuthState';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'approved', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

type DialogKind = 'suspend' | 'reinstate' | 'announce' | 'email';

/**
 * User management.
 *
 * Adds the pieces the original page was missing entirely: search, pagination
 * (it hard-limited to 100 rows), and moderation actions. Suspension is what
 * makes the "Action taken" decision on a report actually mean something.
 */
export default function UsersPage({ role }: { role: StaffRole }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<Array<Awaited<ReturnType<typeof getUsers>>['cursor']>>([null]);
  const [dialog, setDialog] = useState<{ kind: DialogKind; user: AdminUser } | null>(null);
  const [formError, setFormError] = useState('');
  const [reinstateNotes, setReinstateNotes] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['users', status, pageIndex],
    queryFn: async () => {
      const page = await getUsers({ status: status || undefined, cursor: cursors[pageIndex] });
      // Remember the cursor for the next page so paging forward works.
      setCursors((current) => {
        if (current.length > pageIndex + 1) return current;
        return [...current, page.cursor];
      });
      return page;
    },
  });

  const resetPaging = (nextStatus: string) => {
    setStatus(nextStatus);
    setPageIndex(0);
    setCursors([null]);
  };

  // Client-side filtering of the current page. Firestore cannot do substring
  // search, so this narrows what is already loaded rather than pretending to
  // search the whole collection.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data?.users ?? [];
    return (data?.users ?? []).filter((user) =>
      [user.full_name, user.college_email, user.branch]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)));
  }, [data?.users, search]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => suspendUser(id, reason),
    onSuccess: () => { invalidate(); setDialog(null); },
    onError: (mutationError) => setFormError(describeError(mutationError, 'The suspension failed.')),
  });

  const reinstate = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => reinstateUser(id, notes),
    onSuccess: () => { invalidate(); setDialog(null); },
    onError: (mutationError) => setFormError(describeError(mutationError, 'The reinstatement failed.')),
  });

  const announce = useMutation({
    mutationFn: ({ id, title, body }: { id: string; title: string; body: string }) =>
      sendAnnouncement(id, title, body),
    onSuccess: () => setDialog(null),
    onError: (mutationError) => setFormError(describeError(mutationError, 'The message could not be sent.')),
  });

  const email = useMutation({
    mutationFn: ({ to, name }: { to: string; name: string }) =>
      resendWelcomeEmail(to, name, 'your college'),
    onSuccess: () => setDialog(null),
    onError: (mutationError) => setFormError(describeError(mutationError, 'The e-mail could not be sent.')),
  });

  const busy = suspend.isPending || reinstate.isPending || announce.isPending || email.isPending;

  const openDialog = (kind: DialogKind, user: AdminUser) => {
    setFormError('');
    setReinstateNotes('');
    setDialog({ kind, user });
  };

  const columns: Column<AdminUser>[] = [
    {
      header: 'Student',
      accessor: (user) => (
        <div className="flex items-center gap-2">
          <Avatar name={user.full_name} src={user.profile_photos[0]} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="font-semibold truncate">{user.full_name}</div>
            <div className="text-xs text-muted truncate">{user.college_email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Branch / year',
      accessor: (user) => (
        <span className="text-sm">
          {user.branch ?? '—'}{user.year ? ` · Y${user.year}` : ''}
        </span>
      ),
      hideOnMobile: true,
    },
    { header: 'Status', accessor: (user) => <StatusBadge status={user.verification_status} /> },
    {
      header: 'Joined',
      accessor: (user) => <span className="text-sm text-muted">{user.created_at ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      header: 'Last seen',
      accessor: (user) => <span className="text-sm text-muted">{user.last_seen ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      header: 'Actions',
      accessor: (user) => (
        <div className="action-row">
          {user.verification_status === 'suspended' ? (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => openDialog('reinstate', user)}
            >
              <RotateCcw size={14} /> Reinstate
            </button>
          ) : user.verification_status !== 'deleted' ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => openDialog('suspend', user)}
            >
              <Ban size={14} /> Suspend
            </button>
          ) : null}

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => openDialog('announce', user)}
            title="Send an in-app notification"
          >
            <Send size={14} />
          </button>

          {role === 'admin' && user.verification_status !== 'deleted' && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => openDialog('email', user)}
              title="Resend the onboarding e-mail"
            >
              <Mail size={14} />
            </button>
          )}
        </div>
      ),
      width: '260px',
    },
  ];

  const submitSuspend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason.length < 5) {
      setFormError('Give a reason of at least 5 characters — it is recorded in the audit log.');
      return;
    }
    if (dialog) suspend.mutate({ id: dialog.user.id, reason });
  };

  const submitAnnounce = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    if (!title || !body) {
      setFormError('A title and message are both required.');
      return;
    }
    if (dialog) announce.mutate({ id: dialog.user.id, title, body });
  };

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Users</h1>
        <div className="header-actions">
          <span className="text-sm text-muted hide-sm">
            {isLoading ? 'Loading…' : `Page ${pageIndex + 1}`}
          </span>
        </div>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              className="form-input"
              type="search"
              placeholder="Search this page by name, e-mail or branch"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search users on this page"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="filter-chips" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm ${status === option.value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => resetPaging(option.value)}
                aria-pressed={status === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{describeError(error, 'Users could not be loaded.')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        <div className="card">
          <DataTable<AdminUser>
            columns={columns}
            data={rows}
            isLoading={isLoading}
            caption="Registered students"
            emptyMessage={
              search
                ? `No users on this page match “${search.trim()}”.`
                : status
                  ? `No users with status “${status}”.`
                  : 'No students have registered yet.'
            }
            keyExtractor={(user) => user.id}
          />

          <div className="pagination">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pageIndex === 0 || isFetching}
              onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
            >
              ← Previous
            </button>
            <span className="text-sm text-muted">Page {pageIndex + 1}</span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!data?.hasMore || isFetching}
              onClick={() => setPageIndex((index) => index + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ── Suspend ── */}
      <Modal
        open={dialog?.kind === 'suspend'}
        title={`Suspend ${dialog?.user.full_name ?? ''}?`}
        description="They are signed out immediately, every active connection is closed, and they cannot use the app until reinstated."
        busy={busy}
        onClose={() => setDialog(null)}
      >
        <form onSubmit={submitSuspend}>
          <div className="form-group">
            <label className="form-label" htmlFor="suspend-reason">Reason</label>
            <textarea
              id="suspend-reason"
              name="reason"
              className="form-input"
              rows={3}
              maxLength={500}
              placeholder="e.g. Confirmed harassment reported by two students on 12 Aug."
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              required
            />
          </div>
          {formError && (
            <div className="alert alert-danger" role="alert">
              <AlertTriangle size={16} /><span>{formError}</span>
            </div>
          )}
          <div className="action-row">
            <button type="submit" className="btn btn-danger" disabled={busy}>
              {busy ? 'Suspending…' : 'Suspend account'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Reinstate ── */}
      <Modal
        open={dialog?.kind === 'reinstate'}
        title={`Reinstate ${dialog?.user.full_name ?? ''}?`}
        description="Their previous verification status is restored and they can sign in again."
        busy={busy}
        onClose={() => setDialog(null)}
      >
        {dialog?.user.suspension_reason && (
          <div className="alert alert-warning">
            <AlertTriangle size={16} />
            <span>Suspended for: {dialog.user.suspension_reason}</span>
          </div>
        )}
        <div className="form-group">
          <label className="form-label" htmlFor="reinstate-notes">Notes (optional)</label>
          <textarea
            id="reinstate-notes"
            className="form-input"
            rows={2}
            maxLength={500}
            placeholder="Recorded in the audit log."
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
            value={reinstateNotes}
            onChange={(event) => setReinstateNotes(event.target.value)}
          />
        </div>
        {formError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} /><span>{formError}</span>
          </div>
        )}
        <div className="action-row">
          <button
            type="button"
            className="btn btn-success"
            disabled={busy}
            onClick={() => dialog && reinstate.mutate({
              id: dialog.user.id,
              notes: reinstateNotes.trim() || undefined,
            })}
          >
            {busy ? 'Reinstating…' : 'Reinstate account'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      </Modal>

      {/* ── Announcement ── */}
      <Modal
        open={dialog?.kind === 'announce'}
        title={`Message ${dialog?.user.full_name ?? ''}`}
        description="Delivered as a push notification and stored in their in-app inbox."
        busy={busy}
        onClose={() => setDialog(null)}
      >
        <form onSubmit={submitAnnounce}>
          <div className="form-group">
            <label className="form-label" htmlFor="announce-title">Title</label>
            <input id="announce-title" name="title" className="form-input" maxLength={100} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="announce-body">Message</label>
            <textarea
              id="announce-body" name="body" className="form-input" rows={3} maxLength={500}
              style={{ resize: 'vertical', fontFamily: 'inherit' }} required
            />
          </div>
          {formError && (
            <div className="alert alert-danger" role="alert">
              <AlertTriangle size={16} /><span>{formError}</span>
            </div>
          )}
          <div className="action-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send notification'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Resend onboarding e-mail ── */}
      <Modal
        open={dialog?.kind === 'email'}
        title="Resend onboarding e-mail"
        description={`Sends the welcome and verification instructions to ${dialog?.user.college_email ?? ''}.`}
        busy={busy}
        onClose={() => setDialog(null)}
      >
        <p className="text-sm text-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
          Requires SMTP credentials to be configured on the server. If they are not,
          this reports the misconfiguration rather than failing silently.
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
            disabled={busy}
            onClick={() => dialog && email.mutate({
              to: dialog.user.college_email,
              name: dialog.user.full_name,
            })}
          >
            {busy ? 'Sending…' : 'Send e-mail'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
