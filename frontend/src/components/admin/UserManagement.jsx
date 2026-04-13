import React, { useState, useEffect } from 'react';
import { Users, Search, UserPlus, Shield, ToggleLeft, ToggleRight, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const ROLES = ['admin', 'manager', 'agent', 'user', 'viewer'];

const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  agent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  user: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  viewer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

// Mock data for demo mode
const MOCK_USERS = [
  { id: 'demo-001', email: 'admin@swetha.in', full_name: 'Swetha Admin', role: 'admin', is_active: true, company: 'Swetha Structures', plan: 'pro', created_at: '2024-01-01' },
  { id: 'demo-002', email: 'manager@swetha.in', full_name: 'Sales Manager', role: 'manager', is_active: true, company: 'Swetha Structures', plan: 'pro', created_at: '2024-02-15' },
  { id: 'demo-003', email: 'agent@swetha.in', full_name: 'Support Agent', role: 'agent', is_active: true, company: 'Swetha Structures', plan: 'starter', created_at: '2024-03-20' },
  { id: 'demo-004', email: 'user@swetha.in', full_name: 'Regular User', role: 'user', is_active: true, company: 'Swetha Structures', plan: 'starter', created_at: '2024-04-10' },
  { id: 'demo-005', email: 'viewer@swetha.in', full_name: 'Viewer Account', role: 'viewer', is_active: false, company: 'Swetha Structures', plan: 'starter', created_at: '2024-05-05' },
];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'user' });
  const [loading, setLoading] = useState(false);

  // Try to fetch real users from API
  useEffect(() => {
    const token = localStorage.getItem('swetha_token');
    if (token && token !== 'demo-token-123') {
      fetch('/api/v1/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setUsers(data.users || []))
        .catch(() => {}); // Fall back to mock data
    }
  }, []);

  const filtered = users.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q);
    }
    return true;
  });

  const handleRoleChange = (userId, newRole) => {
    if (userId === currentUser?.id) {
      toast.error("Cannot change your own role");
      return;
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    toast.success(`Role updated to ${newRole}`);
  };

  const handleToggleStatus = (userId) => {
    if (userId === currentUser?.id) {
      toast.error("Cannot deactivate your own account");
      return;
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !u.is_active } : u));
    const user = users.find(u => u.id === userId);
    toast.success(user?.is_active ? 'User deactivated' : 'User activated');
  };

  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.full_name) return;

    const newUser = {
      id: `invite-${Date.now()}`,
      email: inviteForm.email,
      full_name: inviteForm.full_name,
      role: inviteForm.role,
      is_active: true,
      company: currentUser?.company || '',
      plan: 'starter',
      created_at: new Date().toISOString().split('T')[0],
    };
    setUsers(prev => [...prev, newUser]);
    setShowInviteModal(false);
    setInviteForm({ email: '', full_name: '', role: 'user' });
    toast.success(`Invitation sent to ${inviteForm.email}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Team Members</h2>
          <span className="text-sm text-slate-500">({users.length})</span>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />Invite User
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
        >
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
        </select>
      </div>

      {/* User Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Joined</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                      {u.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{u.full_name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={u.id === currentUser?.id}
                    className={`px-2 py-1 rounded text-xs font-medium capitalize ${ROLE_COLORS[u.role]} border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleStatus(u.id)}
                    disabled={u.id === currentUser?.id}
                    className="flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {u.is_active ? (
                      <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-xs text-green-600">Active</span></>
                    ) : (
                      <><ToggleLeft className="w-5 h-5 text-slate-400" /><span className="text-xs text-slate-500">Inactive</span></>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{u.created_at?.split('T')[0]}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    <button className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500">No users found</div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Invite Team Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm"
                  placeholder="user@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={inviteForm.full_name}
                  onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm"
                >
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">Send Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
