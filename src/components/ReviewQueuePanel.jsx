// src/components/ReviewQueuePanel.jsx
import { useState, useEffect } from 'react';
import { ref, query, orderByChild, equalTo, onValue, update } from 'firebase/database';
import { database } from '../services/firebase';

function MediaCard({ item, itemId, onAccept, onReject }) {
  return (
    <div className="p-3 bg-[#162d4d] rounded-xl space-y-2">
      {/* Thumbnail */}
      {item.thumbPath ? (
        <div className="w-full h-24 rounded-lg overflow-hidden bg-[#0a1628]">
          <img
            src={`https://firebasestorage.googleapis.com/v0/b/${item.storageBucket}/o/${encodeURIComponent(item.thumbPath)}?alt=media`}
            alt="Report media"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-full h-16 rounded-lg bg-[#0a1628] flex items-center justify-center">
          <span className="text-[10px] text-slate-500">Processing thumbnail...</span>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white font-medium">{item.uploaderName || 'Citizen'}</p>
          <p className="text-[10px] text-slate-400">
            {item.isVideo ? 'Video' : 'Photo'} •{' '}
            {item.uploadedAt ? new Date(item.uploadedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Uploading...'}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onReject(itemId)}
            className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-semibold active:scale-95 transition-transform"
          >
            Reject
          </button>
          <button
            onClick={() => onAccept(itemId)}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold active:scale-95 transition-transform"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewQueuePanel({ isOpen, onClose }) {
  const [items, setItems] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const q = query(
      ref(database, 'media_uploads'),
      orderByChild('processingStatus'),
      equalTo('complete')
    );
    const unsub = onValue(q, (snap) => {
      const data = snap.val() || {};
      const unreviewed = Object.fromEntries(
        Object.entries(data).filter(([, v]) => !v.mediaVerified)
      );
      setItems(unreviewed);
    });
    return () => unsub();
  }, [isOpen]);

  const handleAccept = async (id) => {
    await update(ref(database, `crowd_reports/${id}`), { mediaVerified: true });
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: true });
  };

  const handleReject = async (id) => {
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: false, rejected: true });
  };

  if (!isOpen) return null;

  const entries = Object.entries(items);

  return (
    <div className="absolute inset-0 z-[2000] flex">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm ml-auto h-full glass-card flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-[#00d4ff]/10 flex items-center justify-between">
          <h2 className="font-bold text-white">Review Queue</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-500 text-sm">No pending reviews</p>
            </div>
          ) : (
            entries.map(([id, item]) => (
              <MediaCard key={id} item={item} itemId={id} onAccept={handleAccept} onReject={handleReject} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
