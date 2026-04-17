const STATUS_STYLES = {
  clear:   { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Clear' },
  warning: { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'Caution' },
  flooded: { dot: 'bg-red-400',     text: 'text-red-400',     label: 'Flooded' },
};

const HotspotMiniCard = ({ hotspot, onMoreInfo, onClose }) => {
  if (!hotspot) return null;
  const s = STATUS_STYLES[hotspot.status] ?? STATUS_STYLES.warning;

  return (
    <div className="absolute left-3 right-3 bottom-[230px] z-[1001] animate-slide-up">
      <div className="glass rounded-2xl px-4 py-3 shadow-xl border border-[#00d4ff]/20 flex items-center gap-3">
        {/* Status dot */}
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{hotspot.name}</p>
          <p className={`text-[11px] font-medium ${s.text}`}>{s.label} · {hotspot.waterLevel} cm</p>
        </div>

        {/* More Info */}
        <button
          onClick={onMoreInfo}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#00d4ff]/20 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-semibold active:scale-95 transition-transform"
        >
          More Info
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default HotspotMiniCard;
