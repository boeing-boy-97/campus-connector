import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, ChevronLeft, Clock, RefreshCw, XCircle } from 'lucide-react';
import {
  describeError,
  getVerificationQueue,
  reviewVerification,
  type VerificationQueueItem,
} from '../services/adminService';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';

/**
 * Verification review.
 *
 * The original layout was a fixed 340 px column inside `height:100vh;
 * overflow:hidden`, which was unusable on anything narrow. It is now a
 * responsive two-pane layout that collapses to a single pane with a back button
 * on small screens.
 */
export default function VerificationPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<VerificationQueueItem | null>(null);
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['verification-queue'],
    queryFn: getVerificationQueue,
    refetchInterval: 60_000,
  });

  // Keep the selection in sync with the refreshed queue, and drop it once the
  // request has been reviewed by anyone.
  useEffect(() => {
    if (!selected || !data) return;
    const current = data.find((item) => item.id === selected.id);
    if (!current) setSelected(null);
    else if (current.verification_photo_url !== selected.verification_photo_url) setSelected(current);
  }, [data, selected]);

  const { mutate: review, isPending, error: reviewError } = useMutation({
    mutationFn: ({ id, action, reviewNotes }: {
      id: string;
      action: 'approve' | 'reject';
      reviewNotes?: string;
    }) => reviewVerification(id, action, reviewNotes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['pendingCounts'] });
      setSelected(null);
      setNotes('');
      setValidationError('');
    },
  });

  const handleAction = (action: 'approve' | 'reject') => {
    if (!selected) return;
    if (action === 'reject' && notes.trim().length < 5) {
      setValidationError('A rejection reason of at least 5 characters is required — the student sees it.');
      return;
    }
    setValidationError('');
    review({ id: selected.id, action, reviewNotes: notes.trim() || undefined });
  };

  const pendingCount = data?.length ?? 0;

  return (
    <div className={`split-view${selected ? ' has-selection' : ''}`}>
      <aside className="split-list" aria-label="Verification queue">
        <div className="split-list-head">
          <div>
            <h2>Verification queue</h2>
            <p className="text-sm text-muted">
              {isLoading ? 'Loading…' : `${pendingCount} pending review${pendingCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh queue"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {isLoading && Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="split-list-item">
            <div className="skeleton" style={{ height: 18, marginBottom: 8, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 13, width: '60%', borderRadius: 4 }} />
          </div>
        ))}

        {isError && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">⚠️</div>
            <div className="empty-state-title">Queue unavailable</div>
            <p className="text-sm">{describeError(error, 'Please try again.')}</p>
            <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && pendingCount === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">✅</div>
            <div className="empty-state-title">Queue is clear</div>
            <p className="text-sm">No students are waiting for verification.</p>
          </div>
        )}

        {!isError && data?.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`split-list-item${selected?.id === item.id ? ' is-selected' : ''}`}
            onClick={() => { setSelected(item); setNotes(''); setValidationError(''); }}
            aria-current={selected?.id === item.id}
          >
            <div className="flex items-center gap-3">
              <Avatar name={item.name} src={item.profile_photos[0]} size={42} />
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <div className="font-semibold truncate">{item.name}</div>
                <div className="text-xs text-muted truncate">{item.college_name}</div>
                <div className="text-xs text-muted">{item.submitted_at ?? 'Just now'}</div>
              </div>
            </div>
          </button>
        ))}
      </aside>

      <section className="split-detail">
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 60 }}>
            <div className="empty-state-icon" aria-hidden="true">👈</div>
            <div className="empty-state-title">Select a request</div>
            <p className="text-sm">Choose a student from the queue to review their evidence.</p>
          </div>
        ) : (
          <div className="review-panel">
            <button
              type="button"
              className="btn btn-ghost btn-sm show-sm"
              onClick={() => setSelected(null)}
            >
              <ChevronLeft size={15} /> Back to queue
            </button>

            <div className="card-head">
              <div>
                <h2>{selected.name}</h2>
                <p className="text-sm text-muted">
                  {selected.college_email} · {selected.college_name}
                </p>
              </div>
              <Badge variant="warning"><Clock size={12} /> Pending review</Badge>
            </div>

            <div className="card mb-4">
              <h4 style={{ marginBottom: 14 }}>Student details</h4>
              <dl className="detail-grid">
                {([
                  ['Branch', selected.branch],
                  ['Year', selected.year ? `Year ${selected.year}` : null],
                  ['Gender', selected.gender],
                  ['Date of birth', selected.dob],
                  [
                    'Open to',
                    selected.intent_flags
                      ? Object.entries(selected.intent_flags)
                        .filter(([, enabled]) => enabled)
                        .map(([key]) => key)
                        .join(', ')
                      : null,
                  ],
                  ['Submitted', selected.submitted_at],
                ] as Array<[string, string | null]>).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card mb-4">
              <h4 style={{ marginBottom: 14 }}>Evidence</h4>
              <div className="photo-review-grid">
                {selected.verification_photo_url ? (
                  <figure>
                    <figcaption className="text-xs text-muted">
                      🔒 Verification photo (private, expires shortly)
                    </figcaption>
                    <a href={selected.verification_photo_url} target="_blank" rel="noreferrer noopener">
                      <img
                        src={selected.verification_photo_url}
                        className="photo-preview"
                        alt={`Verification evidence submitted by ${selected.name}`}
                      />
                    </a>
                  </figure>
                ) : (
                  <div className="alert alert-warning">
                    <AlertTriangle size={16} />
                    <span>The verification photo could not be loaded. Refresh the queue to get a new link.</span>
                  </div>
                )}

                {selected.profile_photos.map((url, index) => (
                  <figure key={url}>
                    <figcaption className="text-xs text-muted">Profile photo {index + 1}</figcaption>
                    <img src={url} className="photo-preview" alt={`Profile photo ${index + 1}`} />
                  </figure>
                ))}
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: 14 }}>Decision</h4>

              <div className="form-group">
                <label className="form-label" htmlFor="review-notes">
                  Notes <span className="text-muted">(required to reject — the student sees this)</span>
                </label>
                <textarea
                  id="review-notes"
                  className="form-input"
                  rows={3}
                  placeholder="e.g. The ID card is blurry — please resubmit with the name and college clearly visible."
                  value={notes}
                  onChange={(event) => { setNotes(event.target.value); setValidationError(''); }}
                  maxLength={500}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {validationError && (
                <div className="alert alert-danger" role="alert">
                  <AlertTriangle size={16} /><span>{validationError}</span>
                </div>
              )}

              <div className="action-row">
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => handleAction('approve')}
                  disabled={isPending}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <CheckCircle size={16} />
                  {isPending ? 'Processing…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleAction('reject')}
                  disabled={isPending}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <XCircle size={16} />
                  {isPending ? 'Processing…' : 'Reject'}
                </button>
              </div>
              {reviewError && (
                <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
                  <AlertTriangle size={16} />
                  <span>{describeError(reviewError, 'The review could not be saved.')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
