import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { User } from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Users, Plus, Shield, Edit } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-red',
  manager: 'badge-orange',
  cashier: 'badge-blue',
  kitchen: 'badge-green',
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as const });

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data.data as User[]),
  });

  const createUser = useMutation({
    mutationFn: (body: typeof form) => api.post('/users', body),
    onSuccess: () => {
      toast.success('User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'cashier' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create user';
      toast.error(msg);
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.patch(`/users/${id}`, { active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  const users = data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-white">Users</h1>
        </div>
        {me?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add User
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 h-16 animate-pulse bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Role</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                {me?.role === 'admin' && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-500/30 flex items-center justify-center text-xs font-bold text-brand-300">
                      {u.name[0]}
                    </div>
                    {u.name}
                    {u.id === me?.id && <span className="text-xs text-gray-500">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={ROLE_BADGE[u.role]}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={u.active ? 'badge-green' : 'badge-red'}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {me?.role === 'admin' && (
                    <td className="px-4 py-3">
                      {u.id !== me.id && (
                        <button
                          onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}
                          className="btn-ghost text-xs px-3 py-1.5"
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-500" /> Create User
            </h3>
            {[
              { label: 'Full Name', key: 'name', type: 'text' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Password', key: 'password', type: 'password' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 font-medium">{label}</label>
                <input
                  type={type}
                  className="input mt-1"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-400 font-medium">Role</label>
              <select
                className="input mt-1"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}
              >
                <option value="cashier">Cashier</option>
                <option value="kitchen">Kitchen</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={() => createUser.mutate(form)}
                disabled={createUser.isPending || !form.name || !form.email || !form.password}
                className="btn-primary flex-1"
              >
                {createUser.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
