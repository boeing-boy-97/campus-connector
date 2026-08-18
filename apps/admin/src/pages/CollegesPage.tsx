import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getColleges, createCollege, approveCollege } from '../services/adminService';
import { CheckCircle, XCircle, Plus, X } from 'lucide-react';

export default function CollegesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const queryClient = useQueryClient();

  const { data: colleges, isLoading } = useQuery({ queryKey: ['colleges'], queryFn: getColleges });

  const { mutate: changeStatus } = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      approveCollege(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['colleges'] }),
  });

  const handleAddCollege = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setAddBusy(true);
    setAddError('');
    try {
      await createCollege({
        name: String(form.get('name')).trim(),
        short_name: String(form.get('short_name')).trim(),
        domain: String(form.get('domain')).trim().toLowerCase(),
        logo_url: String(form.get('logo_url')).trim() || '',
        primary_color: String(form.get('primary_color')).trim() || '#6C63FF',
        secondary_color: String(form.get('secondary_color')).trim() || '#E91E63',
        city: String(form.get('city')).trim(),
        state: String(form.get('state')).trim(),
      });
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ['colleges'] });
    } catch (e: any) {
      setAddError(e?.message || 'Failed to add college.');
    } finally {
      setAddBusy(false);
    }
  };

  const statusBadge: Record<string, string> = {
    approved: 'badge-success', pending: 'badge-warning', rejected: 'badge-danger',
  };

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Colleges</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={15} /> Add College
        </button>
      </div>

      <div style={{ padding: 24 }}>
        {/* Add College Form */}
        {showAddForm && (
          <div className="card" style={{ marginBottom: 24, border: '1px solid var(--color-primary)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h3>Add New College</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddCollege}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="c-name">College Name *</label>
                  <input id="c-name" name="name" className="form-input" required placeholder="e.g. J.D. College of Engineering" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-short">Short Name *</label>
                  <input id="c-short" name="short_name" className="form-input" required placeholder="e.g. JDCE" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-domain">Email Domain *</label>
                  <input id="c-domain" name="domain" className="form-input" required placeholder="e.g. jdcollege.edu.in" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-logo">Logo URL</label>
                  <input id="c-logo" name="logo_url" className="form-input" placeholder="https://…" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-city">City *</label>
                  <input id="c-city" name="city" className="form-input" required placeholder="e.g. Nagpur" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-state">State *</label>
                  <input id="c-state" name="state" className="form-input" required placeholder="e.g. Maharashtra" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-primary">Primary Color</label>
                  <input id="c-primary" name="primary_color" className="form-input" type="color" defaultValue="#6C63FF" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="c-secondary">Secondary Color</label>
                  <input id="c-secondary" name="secondary_color" className="form-input" type="color" defaultValue="#E91E63" />
                </div>
              </div>

              {addError && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 12 }}>
                  ⚠️ {addError}
                </div>
              )}

              <div className="flex gap-2" style={{ marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" disabled={addBusy}>
                  {addBusy ? 'Adding…' : 'Add College'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Colleges Table */}
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
                ) : colleges?.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No colleges registered yet.
                    </td>
                  </tr>
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
                      {c.verified_status === 'rejected' && (
                        <span className="text-sm text-muted">❌ Rejected</span>
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
