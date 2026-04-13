/**
 * Renders a row of lane arrow pills from a Mapbox intersection lanes array.
 * lanes — array of { valid: bool, indications: string[] }
 * Only rendered when lanes.length >= 2.
 */
export function LaneGuidance({ lanes }) {
  if (!lanes || lanes.length < 2) return null;

  return (
    <div className="flex items-center gap-1 mb-1">
      {lanes.map((lane, i) => (
        <LanePill key={`${i}-${lane.indications?.[0] ?? 'none'}-${lane.valid}`} lane={lane} />
      ))}
    </div>
  );
}

function LanePill({ lane }) {
  const indication = lane.indications?.[0] ?? 'straight';
  const active = lane.valid ?? false;

  return (
    <div
      className="flex items-center justify-center rounded"
      style={{
        width: 20,
        height: 28,
        background: active ? '#00d4ff22' : '#1e3a5f',
        border: `1px solid ${active ? '#00d4ff88' : '#1e3a5f'}`,
        opacity: active ? 1 : 0.4,
      }}
    >
      <LaneArrow indication={indication} active={active} />
    </div>
  );
}

function LaneArrow({ indication, active }) {
  const color = active ? '#00d4ff' : '#475569';
  const s = { width: 12, height: 12 };
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

  switch (indication) {
    case 'left':
    case 'sharp left':
      return <svg viewBox="0 0 24 24" style={s}><path d="M15 18l-6-6 6-6" {...stroke}/></svg>;
    case 'slight left':
      return <svg viewBox="0 0 24 24" style={s}><path d="M17 18l-5-5 2-7" {...stroke}/></svg>;
    case 'right':
    case 'sharp right':
      return <svg viewBox="0 0 24 24" style={s}><path d="M9 18l6-6-6-6" {...stroke}/></svg>;
    case 'slight right':
      return <svg viewBox="0 0 24 24" style={s}><path d="M7 18l5-5-2-7" {...stroke}/></svg>;
    case 'uturn':
      return <svg viewBox="0 0 24 24" style={s}><path d="M8 18V9a4 4 0 018 0v2" {...stroke}/></svg>;
    default:
      return <svg viewBox="0 0 24 24" style={s}><path d="M12 18V6M7 11l5-5 5 5" {...stroke}/></svg>;
  }
}
