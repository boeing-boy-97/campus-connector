import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Plus, XCircle } from 'lucide-react';
import { z } from 'zod';
import {
  approveCollege,
  createCollege,
  describeError,
  getColleges,
  type AdminCollege,
} from '../services/adminService';
import { Badge, StatusBadge } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';

/**
 * Mirrors the `createCollege` Cloud Function schema, so invalid input is caught
 * before a round trip and the messages match what the server would say.
 */
const collegeSchema = z.object({
  name: z.string().trim().min(3, 'Enter the full college name (at least 3 characters).').max(150),
  short_name: z.string().trim().min(2, 'Enter a short display name.').max(50),
  domain: z.string().trim().toLowerCase().regex(
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    'Enter a bare domain such as jdcollege.edu.in (no @ or https://).',
  ),
  logo_url: z.string().trim().url('Enter a full https:// URL for the logo.')
    .refine((value) => value.startsWith('https://'), 'The logo URL must use https://'),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a six-digit hex colour, e.g. #1A237E.'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a six-digit hex colour, e.g. #E91E63.'),
  city: z.string().trim().min(2, 'Enter the city.').max(100),
  state: z.string().trim().min(2, 'Enter the state.').max(100),
  student_count: z.coerce.number().int().min(0).optional(),
});

const EMPTY_FORM = {
  name: '', short_name: '', domain: '', logo_url: 'https://',
  primary_color: '#1A237E', secondary_color: '#E91E63',
  city: '', state: '', student_count: '',
};

export default function CollegesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [rejecting, setRejecting] = useState<AdminCollege | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: colleges, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['colleges'],
    queryFn: getColleges,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['colleges'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const changeStatus = useMutation({
    mutationFn: ({ id, action, reason }: {
      id: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) => approveCollege(id, action, reason),
    onSuccess: () => { invalidate(); setRejecting(null); setRejectReason(''); },
  });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createCollege>[0]) => createCollege(input),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setSubmitError('');
    },
    onError: (mutationError) =>
      setSubmitError(describeError(mutationError, 'The college could not be created.')),
  });

  // The "Add College" button previously did nothing at all, even though the
  // createCollege callable and its service wrapper both already existed.
  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    setSubmitError('');

    const parsed = collegeSchema.safeParse({
      ...form,
      student_count: form.student_count === '' ? undefined : form.student_count,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.errors.forEach((issue) => {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      });
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    create.mutate(parsed.data);
  };

  const setField = (key: keyof typeof EMPTY_FORM) =>
    (event: { target: { value: string } }) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      setFieldErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };

  const columns: Column<AdminCollege>[] = [
    {
      header: 'College',
      accessor: (college) => (
        <div className="flex items-center gap-2">
          {college.logo_url ? (
            <img
              src={college.logo_url}
              alt=""
              style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', background: '#fff' }}
            />
          ) : (
            <span
              className="college-swatch"
              style={{ background: college.primary_color ?? 'var(--bg-hover)' }}
              aria-hidden="true"
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="font-semibold truncate">{college.name}</div>
            <div className="text-xs text-muted truncate">{college.short_name}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Domain',
      accessor: (college) => <code className="inline-code">@{college.domain}</code>,
    },
    {
      header: 'Location',
      accessor: (college) => (
        <span className="text-sm text-muted">
          {[college.city, college.state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      header: 'Students',
      accessor: (college) => (
        <span className="text-sm text-muted">{college.student_count?.toLocaleString() ?? '—'}</span>
      ),
      hideOnMobile: true,
    },
    { header: 'Status', accessor: (college) => <StatusBadge status={college.verified_status} /> },
    {
      header: 'Actions',
      accessor: (college) => {
        if (college.verified_status === 'pending') {
          return (
            <div className="action-row">
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate({ id: college.id, action: 'approve' })}
              >
                <CheckCircle size={14} /> Approve
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={changeStatus.isPending}
                onClick={() => { setRejecting(college); setRejectReason(''); }}
              >
                <XCircle size={14} /> Reject
              </button>
            </div>
          );
        }
        if (college.verified_status === 'rejected') {
          return (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate({ id: college.id, action: 'approve' })}
            >
              <CheckCircle size={14} /> Approve now
            </button>
          );
        }
        return <Badge variant="success">Accepting signups</Badge>;
      },
      width: '220px',
    },
  ];

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Colleges</h1>
        <div className="header-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Add college
          </button>
        </div>
      </div>

      <div className="page-body">
        <p className="text-sm text-muted" style={{ marginBottom: 16, lineHeight: 1.6, maxWidth: '70ch' }}>
          Only students whose e-mail domain matches an <strong>approved</strong> college can request
          a verification code. Adding a college creates it in the pending state — approve it to open
          signups for that domain.
        </p>

        {isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{describeError(error, 'Colleges could not be loaded.')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        {changeStatus.isError && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{describeError(changeStatus.error, 'The status change failed.')}</span>
          </div>
        )}

        <div className="card">
          <DataTable<AdminCollege>
            columns={columns}
            data={colleges ?? []}
            isLoading={isLoading}
            caption="Registered colleges"
            emptyMessage="No colleges registered yet. Add the first one to open signups."
            keyExtractor={(college) => college.id}
          />
        </div>
      </div>

      <Modal
        open={createOpen}
        title="Add a college"
        description="Creates the college in the pending state. Approve it to allow students on that domain to sign up."
        size="large"
        busy={create.isPending}
        onClose={() => { setCreateOpen(false); setFieldErrors({}); setSubmitError(''); }}
      >
        <form onSubmit={submitCreate} noValidate>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="college-name">Full name</label>
              <input
                id="college-name" className="form-input" value={form.name}
                onChange={setField('name')} placeholder="JD College of Engineering and Management"
                aria-invalid={fieldErrors.name ? 'true' : undefined}
              />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-short">Short name</label>
              <input
                id="college-short" className="form-input" value={form.short_name}
                onChange={setField('short_name')} placeholder="JD College"
                aria-invalid={fieldErrors.short_name ? 'true' : undefined}
              />
              {fieldErrors.short_name && <span className="field-error">{fieldErrors.short_name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-domain">E-mail domain</label>
              <input
                id="college-domain" className="form-input" value={form.domain}
                onChange={setField('domain')} placeholder="jdcollege.edu.in"
                autoCapitalize="none" spellCheck={false}
                aria-invalid={fieldErrors.domain ? 'true' : undefined}
              />
              {fieldErrors.domain
                ? <span className="field-error">{fieldErrors.domain}</span>
                : <span className="field-hint">Students with an @domain address can sign up.</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-students">Approx. students (optional)</label>
              <input
                id="college-students" className="form-input" type="number" min={0}
                value={form.student_count} onChange={setField('student_count')} placeholder="3000"
              />
            </div>

            <div className="form-group span-2">
              <label className="form-label" htmlFor="college-logo">Logo URL</label>
              <input
                id="college-logo" className="form-input" type="url" value={form.logo_url}
                onChange={setField('logo_url')} placeholder="https://example.edu/logo.png"
                aria-invalid={fieldErrors.logo_url ? 'true' : undefined}
              />
              {fieldErrors.logo_url && <span className="field-error">{fieldErrors.logo_url}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-primary">Primary colour</label>
              <div className="color-field">
                <input
                  id="college-primary" type="color" value={form.primary_color}
                  onChange={setField('primary_color')} aria-label="Primary colour picker"
                />
                <input
                  className="form-input" value={form.primary_color}
                  onChange={setField('primary_color')}
                  aria-invalid={fieldErrors.primary_color ? 'true' : undefined}
                />
              </div>
              {fieldErrors.primary_color && <span className="field-error">{fieldErrors.primary_color}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-secondary">Secondary colour</label>
              <div className="color-field">
                <input
                  id="college-secondary" type="color" value={form.secondary_color}
                  onChange={setField('secondary_color')} aria-label="Secondary colour picker"
                />
                <input
                  className="form-input" value={form.secondary_color}
                  onChange={setField('secondary_color')}
                  aria-invalid={fieldErrors.secondary_color ? 'true' : undefined}
                />
              </div>
              {fieldErrors.secondary_color && <span className="field-error">{fieldErrors.secondary_color}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-city">City</label>
              <input
                id="college-city" className="form-input" value={form.city}
                onChange={setField('city')} placeholder="Nagpur"
                aria-invalid={fieldErrors.city ? 'true' : undefined}
              />
              {fieldErrors.city && <span className="field-error">{fieldErrors.city}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="college-state">State</label>
              <input
                id="college-state" className="form-input" value={form.state}
                onChange={setField('state')} placeholder="Maharashtra"
                aria-invalid={fieldErrors.state ? 'true' : undefined}
              />
              {fieldErrors.state && <span className="field-error">{fieldErrors.state}</span>}
            </div>
          </div>

          {submitError && (
            <div className="alert alert-danger" role="alert">
              <AlertTriangle size={16} /><span>{submitError}</span>
            </div>
          )}

          <div className="action-row">
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create college'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => { setCreateOpen(false); setFieldErrors({}); setSubmitError(''); }}
              disabled={create.isPending}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={rejecting !== null}
        title={`Reject ${rejecting?.name ?? ''}?`}
        description="Students on this domain will not be able to sign up. You can approve it later."
        busy={changeStatus.isPending}
        onClose={() => setRejecting(null)}
      >
        <div className="form-group">
          <label className="form-label" htmlFor="reject-reason">Reason (optional)</label>
          <textarea
            id="reject-reason"
            className="form-input"
            rows={3}
            maxLength={500}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Recorded in the audit log."
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <div className="action-row">
          <button
            type="button"
            className="btn btn-danger"
            disabled={changeStatus.isPending}
            onClick={() => rejecting && changeStatus.mutate({
              id: rejecting.id,
              action: 'reject',
              reason: rejectReason.trim() || undefined,
            })}
          >
            {changeStatus.isPending ? 'Rejecting…' : 'Reject college'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRejecting(null)}
            disabled={changeStatus.isPending}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
