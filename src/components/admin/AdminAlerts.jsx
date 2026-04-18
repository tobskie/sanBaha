import { useState, useEffect } from 'react';
import {
  subscribeToAllAlerts,
  adminPublishAlert,
  adminExpireAlert,
} from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';

const SEVERITY_OPTIONS = ['info', 'warning', 'critical'];
const SEVERITY_COLORS = {
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function AdminAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [expiryHours, setExpiryHours] = useState(24);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    return subscribeToAllAlerts(setAlerts);
  }, []);

  const handlePublish = async () => {
    if (!message.trim() || !user) return;
    setPublishing(true);
    try {
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
      await adminPublishAlert(message.trim(), severity, expiresAt, user.uid);
      setMessage('');
    } finally {
      setPublishing(false);
    }
  };

  const now = new Date();
  const active = alerts.filter((a) => new Date(a.expiresAt) > now);
  const expired = alerts.filter((a) => new Date(a.expiresAt) <= now);

  return (
    <div className="p-6 space-y-8">
      <h2 className="text-lg font-bold text-white">City-Wide Alerts</h2>

      <section className="glass rounded-xl p-4 border border-[#00d4ff]/10">
        <h3 className="text-sm font-semibold text-white mb-4">Publish Alert</h3>
        <textarea
          placeholder="Alert message (max 200 characters)…"
          maxLength={200}
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none resize-none mb-3"
        />
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-[10px] text-slate-400 mb-1.5">Severity</p>
            <div className="flex gap-1.5">
              {SEVERITY_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors ${
                    severity === s ? SEVERITY_COLORS[s] : 'text-slate-400 border-[#162d4d] hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1.5">Expires after</p>
            <select
              value={expiryHours}
              onChange={(e) => setExpiryHours(Number(e.target.value))}
              className="bg-[#162d4d] rounded-lg px-3 py-2 text-sm text-white border border-[#162d4d] focus:border-[#00d4ff]/40 outline-none"
            >
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
            </select>
          </div>
          <button
            onClick={handlePublish}
            disabled={!message.trim() || publishing}
            className="px-4 py-2 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-medium disabled:opacity-40"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">{message.length}/200</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white mb-3">Active ({active.length})</h3>
        {active.length === 0 ? (
          <p className="text-slate-500 text-sm">No active alerts.</p>
        ) : (
          <div className="space-y-2">
            {active.map((a) => (
              <div key={a.id} className="glass rounded-xl px-4 py-3 border border-[#162d4d] flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border capitalize ${SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.info}`}>
                      {a.severity}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Expires {new Date(a.expiresAt).toLocaleString('en-PH')}
                    </span>
                  </div>
                  <p className="text-sm text-white">{a.message}</p>
                </div>
                <button
                  onClick={() => adminExpireAlert(a.id)}
                  className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium flex-shrink-0"
                >
                  Expire now
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {expired.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Expired ({expired.length})</h3>
          <div className="space-y-2">
            {expired.slice(0, 10).map((a) => (
              <div key={a.id} className="rounded-xl px-4 py-3 border border-[#162d4d] opacity-50">
                <p className="text-xs text-slate-400 capitalize">{a.severity} · expired {new Date(a.expiresAt).toLocaleString('en-PH')}</p>
                <p className="text-sm text-slate-300 mt-0.5">{a.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
