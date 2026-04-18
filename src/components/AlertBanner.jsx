const SEVERITY_STYLES = {
  info: 'bg-blue-500/20 border-blue-500/30 text-blue-200',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-200',
  critical: 'bg-red-500/20 border-red-500/30 text-red-200',
};

export default function AlertBanner({ alerts, dismissed, onDismiss }) {
  const active = alerts.filter((a) => !dismissed.has(a.id));
  if (active.length === 0) return null;
  const top = active[0];

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm ${SEVERITY_STYLES[top.severity] || SEVERITY_STYLES.info}`}>
      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <span className="flex-1 min-w-0 truncate">{top.message}</span>
      {active.length > 1 && (
        <span className="text-[11px] opacity-70 flex-shrink-0">+{active.length - 1} more</span>
      )}
      <button
        onClick={() => onDismiss(top.id)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss alert"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
