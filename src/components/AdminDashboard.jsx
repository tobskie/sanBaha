// src/components/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { database, storage } from '../services/firebase';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

function MediaRow({ id, item, onAccept, onReject }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    if (!item.thumbPath) return;
    getDownloadURL(storageRef(storage, item.thumbPath))
      .then(setThumbUrl)
      .catch(() => {});
  }, [item.thumbPath]);

  const timeStr = item.uploadedAt
    ? new Date(item.uploadedAt).toLocaleString('en-PH')
    : 'Pending upload';

  const coords = Array.isArray(item.coordinates)
    ? `${item.coordinates[0].toFixed(4)}, ${item.coordinates[1].toFixed(4)}`
    : '—';

  return (
    <tr className="border-b border-[#162d4d] hover:bg-[#162d4d]/30 transition-colors">
      <td className="p-3">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-16 h-12 object-cover rounded-lg" />
        ) : (
          <div className="w-16 h-12 rounded-lg bg-[#162d4d] flex items-center justify-center">
            <span className="text-[9px] text-slate-500">{item.processingStatus}</span>
          </div>
        )}
      </td>
      <td className="p-3">
        <p className="text-sm text-white">{item.uploaderName || '—'}</p>
        <p className="text-[10px] text-slate-400">{item.isVideo ? 'Video' : 'Photo'}</p>
      </td>
      <td className="p-3 text-[10px] text-slate-400">{coords}</td>
      <td className="p-3 text-[10px] text-slate-400">{timeStr}</td>
      <td className="p-3">
        {item.mediaVerified === true ? (
          <span className="text-[10px] text-emerald-400 font-medium">Accepted</span>
        ) : item.rejected ? (
          <span className="text-[10px] text-red-400 font-medium">Rejected</span>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={() => onReject(id)}
              className="px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-semibold"
            >
              Reject
            </button>
            <button
              onClick={() => onAccept(id)}
              className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold"
            >
              Accept
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function AdminDashboard() {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const [uploads, setUploads] = useState({});
  const [floodActive, setFloodActive] = useState(false);

  useEffect(() => {
    const unsub1 = onValue(ref(database, 'media_uploads'), (snap) => {
      setUploads(snap.val() || {});
    });
    const unsub2 = onValue(ref(database, 'system/floodActive'), (snap) => {
      setFloodActive(snap.val() === true);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  if (!user) return <Navigate to="/" />;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <p className="text-slate-400">Access denied. Admin role required.</p>
    </div>
  );

  const handleAccept = async (id) => {
    await update(ref(database, `crowd_reports/${id}`), { mediaVerified: true });
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: true });
  };

  const handleReject = async (id) => {
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: false, rejected: true });
  };

  const pending = Object.entries(uploads).filter(([, v]) => v.processingStatus === 'complete' && !v.mediaVerified && !v.rejected);
  const reviewed = Object.entries(uploads).filter(([, v]) => v.mediaVerified || v.rejected);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      {/* Top bar */}
      <div className="glass border-b border-[#00d4ff]/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold gradient-text">sanBaha Admin</h1>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${floodActive ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
            {floodActive ? 'ACTIVE FLOOD' : 'Normal'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{user.displayName}</span>
          <a href="/" className="text-[10px] text-[#00d4ff]">← Back to map</a>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Pending Review */}
        <section>
          <h2 className="text-base font-bold text-white mb-4">
            Intake Queue <span className="text-slate-400 text-sm font-normal">({pending.length} pending)</span>
          </h2>
          {pending.length === 0 ? (
            <p className="text-slate-500 text-sm">No items pending review.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#162d4d]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#162d4d] text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="p-3">Preview</th>
                    <th className="p-3">Uploader</th>
                    <th className="p-3">Coordinates</th>
                    <th className="p-3">Uploaded</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(([id, item]) => (
                    <MediaRow key={id} id={id} item={item} onAccept={handleAccept} onReject={handleReject} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Reviewed */}
        <section>
          <h2 className="text-base font-bold text-white mb-4">
            Reviewed <span className="text-slate-400 text-sm font-normal">({reviewed.length} total)</span>
          </h2>
          {reviewed.length === 0 ? (
            <p className="text-slate-500 text-sm">No reviewed items yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#162d4d]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#162d4d] text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="p-3">Preview</th>
                    <th className="p-3">Uploader</th>
                    <th className="p-3">Coordinates</th>
                    <th className="p-3">Uploaded</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map(([id, item]) => (
                    <MediaRow key={id} id={id} item={item} onAccept={handleAccept} onReject={handleReject} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
