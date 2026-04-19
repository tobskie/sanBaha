import { useState, useEffect } from 'react';
import { subscribeToAllReports, adminVerifyReport, adminDeleteReport } from '../../services/adminService';

const FILTERS = ['All', 'Unverified', 'Verified', 'Flooded', 'Warning'];

const SEVERITY_COLORS = {
  flooded: 'text-red-400 bg-red-500/10 border-red-500/20',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  clear: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    return subscribeToAllReports(setReports);
  }, []);

  const filtered = reports.filter((r) => {
    if (filter === 'Unverified') return !r.verified;
    if (filter === 'Verified') return r.verified;
    if (filter === 'Flooded') return r.severity === 'flooded';
    if (filter === 'Warning') return r.severity === 'warning';
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Crowd Reports</h2>
        <span className="text-sm text-slate-400">{reports.length} total</span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/30'
                : 'text-slate-400 border border-[#162d4d] hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-500 text-sm py-8 text-center">No reports match this filter.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="glass rounded-xl p-4 border border-[#162d4d]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.warning}`}>
                      {(r.severity || 'unknown').toUpperCase()}
                    </span>
                    {r.verified && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                        VERIFIED
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white truncate">{r.locationName || r.id}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {r.reporterId || 'anonymous'} · {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-PH') : '—'}
                  </p>
                  {r.description && (
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2">{r.description}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!r.verified && (
                    <button
                      onClick={() => adminVerifyReport(r.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium"
                    >
                      Verify
                    </button>
                  )}
                  <button
                    onClick={() => { if (window.confirm(`Delete report "${r.locationName || r.id}"? This cannot be undone.`)) adminDeleteReport(r.id); }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
