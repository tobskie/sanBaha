/**
 * Returns an SVG element for a Mapbox maneuver type + modifier.
 * color — hex string, defaults to '#00d4ff'
 * size  — pixel size, defaults to 20
 */
export function ManeuverIcon({ type, modifier, color = '#00d4ff', size = 20 }) {
  const s = { width: size, height: size };
  const stroke = { stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

  if (type === 'arrive') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <circle cx="12" cy="12" r="4" fill={color} />
        <circle cx="12" cy="12" r="8" {...stroke} />
      </svg>
    );
  }

  if (type === 'depart') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <circle cx="12" cy="8" r="3" fill={color} />
        <path d="M12 11v9" {...stroke} />
      </svg>
    );
  }

  if (type === 'uturn' || modifier === 'uturn') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M8 20V9a4 4 0 018 0v2M8 20l-3-3m3 3l3-3" {...stroke} />
      </svg>
    );
  }

  if (type === 'roundabout' || type === 'rotary') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M12 4a8 8 0 100 16A8 8 0 0012 4z" {...stroke} />
        <path d="M16 12l-4-4-4 4" {...stroke} />
      </svg>
    );
  }

  if (modifier === 'sharp left') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M18 20V10H8M8 10l4-4M8 10l4 4" {...stroke} />
      </svg>
    );
  }
  if (modifier === 'left') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M15 18l-6-6 6-6" {...stroke} />
      </svg>
    );
  }
  if (modifier === 'slight left') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M17 18l-5-5 2-7" {...stroke} />
      </svg>
    );
  }

  if (modifier === 'sharp right') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M6 20V10h10M16 10l-4-4M16 10l-4 4" {...stroke} />
      </svg>
    );
  }
  if (modifier === 'right') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M9 18l6-6-6-6" {...stroke} />
      </svg>
    );
  }
  if (modifier === 'slight right') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M7 18l5-5-2-7" {...stroke} />
      </svg>
    );
  }

  // Straight / default
  return (
    <svg viewBox="0 0 24 24" style={s}>
      <path d="M12 20V4M5 11l7-7 7 7" {...stroke} />
    </svg>
  );
}
