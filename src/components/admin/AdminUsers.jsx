import { useState, useEffect } from 'react';
import { subscribeToAllUsers, adminSetUserRole } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return subscribeToAllUsers(setUsers);
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.uid.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const toggleRole = (uid, currentRole) => {
    if (uid === currentUser?.uid) return;
    adminSetUserRole(uid, currentRole === 'admin' ? 'user' : 'admin');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Users</h2>
        <span className="text-sm text-slate-400">{users.length} total</span>
      </div>

      <input
        placeholder="Search by name, email, or UID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 bg-[#162d4d] rounded-xl px-4 py-2.5 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">No users found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const isSelf = u.uid === currentUser?.uid;
            const isAdmin = u.role === 'admin';
            return (
              <div key={u.uid} className="glass rounded-xl px-4 py-3 border border-[#162d4d] flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{u.displayName || u.email || '(no name)'}</p>
                  <p className="text-[11px] text-slate-400 truncate">{u.uid}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${isAdmin ? 'text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/20' : 'text-slate-400 bg-[#162d4d] border border-[#162d4d]'}`}>
                    {u.role || 'user'}
                  </span>
                  <button
                    onClick={() => toggleRole(u.uid, u.role)}
                    disabled={isSelf}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelf
                        ? 'opacity-40 cursor-not-allowed bg-[#162d4d] text-slate-500'
                        : isAdmin
                        ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    {isAdmin ? 'Revoke Admin' : 'Make Admin'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
