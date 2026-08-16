import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../services/adminService';
import { useState } from 'react';
import { Users } from 'lucide-react';

export default function UsersPage() {
  const [filter, setFilter] = useState('');
  const { data: users, isLoading } = useQuery({ queryKey: ['users', filter], queryFn: () => getUsers(filter || undefined) });

  const statusColors: Record<string, string> = {
    approved: 'badge-success', pending: 'badge-warning',
    rejected: 'badge-danger', suspended: 'badge-danger', deleted: 'badge-neutral',
  };

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Users</h1>
        <div className="flex gap-2">
          {['', 'approved', 'pending', 'rejected', 'suspended'].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(s)}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24 }}>
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>College Email</th>
                  <th>Branch / Year</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 16, borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                ) : users?.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <img src={u.profile_photos?.[0] || '/avatar-placeholder.png'} className="avatar" style={{ width: 36, height: 36 }} alt="" />
                        <div>
                          <div className="font-semibold">{u.full_name || '—'}</div>
                          <div className="text-xs text-muted">{u.gender || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-muted">{u.college_email}</td>
                    <td className="text-sm">{u.branch || '—'} {u.year ? `· Y${u.year}` : ''}</td>
                    <td><span className={`badge ${statusColors[u.verification_status] || 'badge-neutral'}`}>{u.verification_status}</span></td>
                    <td className="text-sm text-muted">{u.created_at?.toDate?.().toLocaleDateString('en-IN') || '—'}</td>
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
