import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getColleges, approveCollege } from '../services/adminService';
import { Building2, CheckCircle, XCircle, Plus } from 'lucide-react';

export default function CollegesPage() {
  const queryClient = useQueryClient();
  const { data: colleges, isLoading } = useQuery({ queryKey: ['colleges'], queryFn: getColleges });

  const { mutate: changeStatus } = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      approveCollege(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['colleges'] }),
  });

  const statusBadge: Record<string, string> = {
    approved: 'badge-success', pending: 'badge-warning', rejected: 'badge-danger',
  };

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Colleges</h1>
        <button className="btn btn-primary btn-sm">
          <Plus size={15} /> Add College
        </button>
      </div>

      <div style={{ padding: 24 }}>
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>College</th>
                  <th>Domain</th>
                  <th>City / State</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 16, borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                ) : colleges?.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {c.logo_url ? (
                          <img src={c.logo_url} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} alt="" />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: 6, background: c.primary_color || 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏫</div>
                        )}
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-muted">{c.short_name}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code style={{ background: 'var(--bg-hover)', padding: '3px 8px', borderRadius: 4, fontSize: 13 }}>
                        @{c.domain}
                      </code>
                    </td>
                    <td className="text-sm text-muted">{c.city}, {c.state}</td>
                    <td><span className={`badge ${statusBadge[c.verified_status] || 'badge-neutral'}`}>{c.verified_status}</span></td>
                    <td>
                      {c.verified_status === 'pending' && (
                        <div className="flex gap-2">
                          <button className="btn btn-success btn-sm" onClick={() => changeStatus({ id: c.id, action: 'approve' })}>
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => changeStatus({ id: c.id, action: 'reject' })}>
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}
                      {c.verified_status === 'approved' && (
                        <span className="text-sm text-muted">✅ Active</span>
                      )}
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
