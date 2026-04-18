import { getStatusDetails } from '../data/mockData';
import useReportVerification from '../hooks/useReportVerification';
import { useAuth } from '../contexts/AuthContext';

const VerificationDots = ({ count }) => (
  <div className="flex items-center gap-1">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className={`w-2.5 h-2.5 rounded-full border ${
          i < count
            ? 'bg-emerald-400 border-emerald-400'
            : 'bg-transparent border-slate-500'
        }`}
      />
    ))}
  </div>
);

const HotspotDetail = ({ hotspot, onClose, onNavigate, isRouting, onError, inline = false }) => {
  const { user } = useAuth();
  const isCrowdsourced = hotspot?.type === 'crowdsourced';
  const { count, verified, hasVerified, mediaUrl, isVideo, submitting, error, verify } =
    useReportVerification(isCrowdsourced ? hotspot?.id : null);

  if (!hotspot) return null;

  const statusDetails = getStatusDetails(hotspot.status);

  const formatTime = (isoString) => {
    return new Date(isoString).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleVerify = () => {
    if (!user) {
      onError?.('Please sign in to verify flood reports.');
      return;
    }
    verify();
  };

  const content = (
    <div className="glass rounded-2xl p-3 shadow-xl border border-[#00d4ff]/20">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              hotspot.status === 'clear'
                ? 'bg-emerald-500/20'
                : hotspot.status === 'warning'
                ? 'bg-amber-500/20'
                : 'bg-red-500/20'
            }`}
          >
            {hotspot.status === 'clear' ? (
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : hotspot.status === 'warning' ? (
              <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">{hotspot.name}</h3>
            <p className="text-[10px] text-slate-400">{hotspot.location}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Report image — only for crowdsourced with an uploaded media file */}
      {isCrowdsourced && mediaUrl && !isVideo && (
        <div className="mb-3 rounded-xl overflow-hidden max-h-32 bg-[#0a1628]">
          <img src={mediaUrl} alt="Flood report" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 bg-[#0a1628] rounded-lg text-center">
          <p
            className={`text-xl font-bold ${
              hotspot.status === 'clear'
                ? 'text-emerald-400'
                : hotspot.status === 'warning'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {hotspot.waterLevel}
          </p>
          <p className="text-[9px] text-slate-400">cm</p>
        </div>
        <div className="p-2 bg-[#0a1628] rounded-lg text-center">
          <p
            className={`text-xs font-bold ${
              hotspot.status === 'clear'
                ? 'text-emerald-400'
                : hotspot.status === 'warning'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {statusDetails.label}
          </p>
          <p className="text-[9px] text-slate-400">status</p>
        </div>
        <div className="p-2 bg-[#0a1628] rounded-lg text-center">
          <p className="text-xs font-bold text-[#00d4ff]">{formatTime(hotspot.lastUpdate)}</p>
          <p className="text-[9px] text-slate-400">updated</p>
        </div>
      </div>

      {/* Description — crowdsourced only */}
      {isCrowdsourced && hotspot.description && (
        <div className="mb-3 p-2.5 bg-[#0a1628] rounded-xl">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Description</span>
          <p className="text-xs text-slate-300 leading-relaxed">{hotspot.description}</p>
        </div>
      )}

      {/* Community Verification — crowdsourced only */}
      {isCrowdsourced && (
        <div className="mb-3 p-2.5 bg-[#0a1628] rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              Community Verification
            </span>
            {verified ? (
              <span className="text-[10px] font-semibold text-emerald-400">✓ Verified</span>
            ) : (
              <span className="text-[10px] text-slate-500">{count}/3</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <VerificationDots count={Math.min(count, 3)} />
            {hasVerified ? (
              <span className="text-[10px] text-emerald-400 font-medium">You verified this</span>
            ) : (
              <button
                onClick={handleVerify}
                disabled={submitting || verified}
                className={`
                  px-3 py-1 rounded-lg text-[10px] font-semibold transition-all active:scale-95
                  ${submitting
                    ? 'bg-[#162d4d] text-slate-500 cursor-not-allowed'
                    : verified
                    ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'}
                `}
              >
                {submitting ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : verified ? (
                  'Confirmed'
                ) : (
                  'Verify Flood'
                )}
              </button>
            )}
          </div>
          {error && <p className="mt-1.5 text-[10px] text-red-400">{error}</p>}
        </div>
      )}

      {/* Action Button — hidden for flooded zones */}
      {hotspot.status !== 'flooded' && (
        <button
          onClick={onNavigate}
          disabled={isRouting}
          className={`
            w-full py-2.5 rounded-xl font-medium text-xs
            flex items-center justify-center gap-2 transition-all active:scale-[0.98]
            ${isRouting
              ? 'opacity-50 cursor-not-allowed bg-[#162d4d] text-slate-400'
              : 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628]'}
          `}
        >
          {isRouting ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Calculating route...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Navigate Here
            </>
          )}
        </button>
      )}
    </div>
  );

  if (inline) return content;
  return (
    <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
      {content}
    </div>
  );
};

export default HotspotDetail;
