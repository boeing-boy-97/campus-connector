import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVerificationQueue, reviewVerification } from '../services/adminService';
import { CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

export default function VerificationPage() {
  const [selected, setSelected] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['verification-queue'],
    queryFn: getVerificationQueue,
    refetchInterval: 30_000,
  });

  const { mutate: review, isPending: reviewing } = useMutation({
    mutationFn: ({ id, action, notes }: { id: string; action: 'approve' | 'reject'; notes?: string }) =>
      reviewVerification(id, action, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['pendingCounts'] });
      setSelected(null);
      setNotes('');
    },
  });

  const handleAction = (action: 'approve' | 'reject') => {
    if (!selected) return;
    if (action === 'reject' && !notes.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }
    review({ id: selected.id, action, notes: notes.trim() || undefined });
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Queue List */}
      <div style={{ width: 340, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-surface)' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 18 }}>Verification Queue</h2>
          <p className="text-sm text-muted mt-4">
            {data?.length ?? 0} pending review{data?.length !== 1 ? 's' : ''}
          </p>
        </div>

        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div className="skeleton" style={{ height: 20, marginBottom: 8, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 4 }} />
            </div>
          ))
        ) : data?.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-title">Queue is clear!</div>
            <p className="text-sm">No pending verifications.</p>
          </div>
        ) : data?.map((item: any) => (
          <button
            key={item.id}
            onClick={() => { setSelected(item); setNotes(''); }}
            style={{
              width: '100%', padding: 16, textAlign: 'left', border: 'none',
              borderBottom: '1px solid var(--border)',
              background: selected?.id === item.id ? 'rgba(108,99,255,0.1)' : 'transparent',
              cursor: 'pointer', borderLeft: selected?.id === item.id ? '3px solid var(--color-primary)' : '3px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <div className="flex items-center gap-3">
              <div style={{ position: 'relative' }}>
                <img
                  src={item.profile_photo || '/avatar-placeholder.png'}
                  className="avatar"
                  style={{ width: 44, height: 44 }}
                  alt=""
                />
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#F59E0B', border: '2px solid var(--bg-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Clock size={10} color="white" />
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="font-semibold truncate">{item.name}</div>
                <div className="text-xs text-muted truncate">{item.college_name}</div>
                <div className="text-xs text-muted">{item.submitted_at}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Review Panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 80 }}>
            <div className="empty-state-icon">👈</div>
            <div className="empty-state-title">Select a Request</div>
            <p className="text-sm">Choose a verification request from the queue to review.</p>
          </div>
        ) : (
          <div style={{ maxWidth: 700 }}>
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2>{selected.name}</h2>
                <p className="text-sm text-muted">{selected.college_email} · {selected.college_name}</p>
              </div>
              <span className="badge badge-warning">
                <Clock size={12} /> Pending Review
              </span>
            </div>

            {/* Profile Details */}
            <div className="card mb-4">
              <h4 style={{ marginBottom: 16 }}>Student Details</h4>
              <div className="grid-2" style={{ gap: 12 }}>
                {[
                  ['Branch', selected.branch],
                  ['Year', `Year ${selected.year}`],
                  ['Gender', selected.gender],
                  ['Date of Birth', selected.dob],
                  ['Intent', selected.intent_flags ? Object.entries(selected.intent_flags).filter(([,v]) => v).map(([k]) => k).join(', ') : '—'],
                  ['Submitted', selected.submitted_at],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{label}</div>
                    <div className="font-semibold" style={{ fontSize: 14 }}>{value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Photos */}
            <div className="card mb-4">
              <h4 style={{ marginBottom: 16 }}>Photos</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {/* Verification photo — shown only to admins */}
                {selected.uniform_photo_url && (
                  <div>
                    <div className="text-xs text-muted mb-4" style={{ marginBottom: 8 }}>
                      🔒 Verification Photo (Private)
                    </div>
                    <img
                      src={selected.uniform_photo_url}
                      className="photo-preview"
                      alt="Verification photo"
                    />
                  </div>
                )}
                {selected.profile_photos?.map((url: string, i: number) => (
                  <div key={i}>
                    <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                      Profile Photo {i + 1}
                    </div>
                    <img src={url} className="photo-preview" alt={`Profile ${i + 1}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Decision */}
            <div className="card">
              <h4 style={{ marginBottom: 16 }}>Review Decision</h4>

              <div className="form-group">
                <label className="form-label" htmlFor="review-notes">
                  Notes (required for rejection)
                </label>
                <textarea
                  id="review-notes"
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Photo is blurry, please resubmit with college ID visible"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div className="flex gap-2" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-success"
                  onClick={() => handleAction('approve')}
                  disabled={reviewing}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <CheckCircle size={16} />
                  {reviewing ? 'Processing…' : 'Approve ✓'}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleAction('reject')}
                  disabled={reviewing}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <XCircle size={16} />
                  {reviewing ? 'Processing…' : 'Reject ✗'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
