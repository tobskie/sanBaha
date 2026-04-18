import { useState, useEffect } from 'react';
import { subscribeToLogs } from '../../services/adminService';

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [filterType, setFilterType] = useState('All');

  useEffect(() => {
    return subscribeToLogs(setLogs);
  }, []);

  const allTypes = ['All', ...new Set(logs.map((l) => l.event || l.type || 'unknown').filter(Boolean))];

  const filtered = filterType === 'All'
    ? logs
    : logs.filter((l) => (l.event || l.type) === filterType);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Admin Logs</h2>
        <span className="text-sm text-slate-400">{logs.length} entries</span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {allTypes.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterType === t
                ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/30'
                : 'text-slate-400 border border-[#162d4d] hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">No log entries found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <div key={log.id} className="glass rounded-xl px-4 py-3 border border-[#162d4d]">
              <div className="flex items-center gap-3 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#162d4d] text-slate-300 border border-[#162d4d] capitalize">
                  {log.event || log.type || 'unknown'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('en-PH') : '—'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Actor: <span className="text-slate-300">{log.uid || log.actor || '—'}</span>
              </p>
              {log.details && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">{JSON.stringify(log.details)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
