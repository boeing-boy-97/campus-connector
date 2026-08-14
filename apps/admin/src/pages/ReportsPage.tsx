import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReports, updateReportStatus } from '../services/adminService';
import { Flag, CheckCircle, XCircle } from 'lucide-react';

type ReviewStatus = 'action_taken' | 'dismissed';

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { data: reports, isLoading, isError } = useQuery({
    queryKey: ['reports'],
    queryFn: getReports,
    refetchInterval: 60_000,
  });

  const { mutate: resolve, isPending: reviewPending, isError: reviewFailed } = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: ReviewStatus; notes?: string }) =>
      updateReportStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['pendingCounts'] });
    },
  });

  const reasonLabels: Record<string, string> = {
    harassment: '😡 Harassment',
    fake_profile: '🎭 Fake Profile',
    inappropriate_content: '🔞 Inappropriate Content',
    spam: '📢 Spam',
    other: '❓ Other',
  };

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Reports</h1>
        <span className="badge badge-danger">
          <Flag size={12} /> {reports?.length ?? 0} Open
        </span>
      </div>

      <div style={{ padding: 24 }}>
        {isLoading ? (
          <div className="card">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ height: 20, marginBottom: 8, borderRadius: 4, width: '40%' }} />
                <div className="skeleton" style={{ height: 14, borderRadius: 4, width: '70%' }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">Could not load reports</div>
            <p className="text-sm">Check your connection and administrator permissions, then try again.</p>
          </div>
        ) : reports?.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-title">No Open Reports</div>
            <p className="text-sm">All reports have been resolved.</p>
          </div>
        ) : (
          <div className="card">
            {reviewFailed && (
              <p className="text-sm" role="alert" style={{ color: 'var(--danger)', padding: '12px 16px 0' }}>
                The report could not be reviewed. Refresh and try again.
              </p>
            )}
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Reporter</th>
                    <th>Reported User</th>
                    <th>Reason</th>
                    <th>Description</th>
                    <th>Filed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports?.map((r) => (
                    <tr key={r.id}>
                      <td><span className="badge badge-info">{r.reporter_id?.slice(0, 8)}…</span></td>
                      <td><span className="badge badge-neutral">{r.reported_id?.slice(0, 8)}…</span></td>
                      <td><span className="badge badge-danger">{reasonLabels[r.reason] || r.reason}</span></td>
                      <td className="text-sm" style={{ maxWidth: 200 }}>
                        <div className="truncate">{r.description || '—'}</div>
                      </td>
                      <td className="text-muted text-sm">{r.created_at?.toDate?.().toLocaleDateString('en-IN') || '—'}</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            className="btn btn-success btn-sm"
                            disabled={reviewPending}
                            onClick={() => resolve({ id: r.id, status: 'action_taken', notes: 'User warned or suspended after moderator review.' })}
                            title="Take Action"
                          >
                            <CheckCircle size={14} /> Action Taken
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={reviewPending}
                            onClick={() => resolve({ id: r.id, status: 'dismissed' })}
                            title="Dismiss"
                          >
                            <XCircle size={14} /> Dismiss
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
