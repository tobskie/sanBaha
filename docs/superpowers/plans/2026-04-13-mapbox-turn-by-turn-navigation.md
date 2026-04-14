# Mapbox Turn-by-Turn Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time turn-by-turn navigation banner with expandable step list, lane guidance, automatic off-route re-routing, and offline tile caching to sanBaha.

**Architecture:** A `useNavigationStep` hook tracks the user's progress along the Mapbox Directions route steps, detects off-route deviations, and extracts lane data. A `NavigationBanner` component renders the top banner (collapsed/expanded) and consumes the hook's output. A service worker at `public/sw.js` caches Mapbox tiles when navigation starts so the map works offline.

**Tech Stack:** React 19, Vitest + @testing-library/react, @turf/turf, Mapbox Directions API (already in use), Vite, service worker (vanilla JS)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/useNavigationStep.js` | Step tracking, off-route detection, lane extraction, flood annotation |
| Create | `src/hooks/useNavigationStep.test.js` | Unit tests for the hook |
| Create | `src/utils/maneuverIcons.jsx` | SVG icons keyed on Mapbox maneuver type+modifier |
| Create | `src/utils/laneGuidance.jsx` | Lane diagram component from Mapbox intersection lane data |
| Create | `src/components/NavigationBanner.jsx` | Top banner — collapsed & expanded states, re-routing indicator |
| Create | `src/components/NavigationBanner.test.jsx` | Render tests for the banner |
| Create | `public/sw.js` | Service worker — Mapbox tile cache-first strategy |
| Modify | `src/App.jsx` | Mount NavigationBanner, wire onReroute callback, register SW |
| Modify | `src/components/FloodMap.jsx` | Add flood warning pill overlay prop |

---

## Task 1: `useNavigationStep` — step tracking

**Files:**
- Create: `src/hooks/useNavigationStep.js`
- Create: `src/hooks/useNavigationStep.test.js`

The hook receives the full `routeData` from App.jsx state (the return value of `getSmartRouteWithAvoidance`). Steps live at `routeData.safeRoute.route.legs[0].steps`. The full route geometry for snapping is at `routeData.safeRoute.geometry` (a GeoJSON LineString object, not a Feature).

Each Mapbox step has:
- `maneuver.location` — `[lng, lat]` of the turn point
- `maneuver.type` — e.g. `"turn"`, `"depart"`, `"arrive"`
- `maneuver.modifier` — e.g. `"left"`, `"right"`, `"slight left"`
- `maneuver.instruction` — human-readable string
- `distance` — metres for this step
- `duration` — seconds for this step
- `name` — street name
- `intersections` — array; each may have a `lanes` array

- [ ] **Step 1.1: Write failing tests**

Create `src/hooks/useNavigationStep.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useNavigationStep from './useNavigationStep';

// Minimal Mapbox-style steps along a straight line (lng increases eastward)
const makeStep = (lng, lat, type = 'turn', modifier = 'right', distance = 100) => ({
  maneuver: { location: [lng, lat], type, modifier, instruction: `${type} ${modifier}` },
  distance,
  duration: 30,
  name: 'Test St',
  intersections: [],
  geometry: {
    type: 'LineString',
    coordinates: [[lng, lat], [lng + 0.001, lat]],
  },
});

const makeRouteData = (steps) => ({
  safeRoute: {
    geometry: {
      type: 'LineString',
      coordinates: steps.map(s => s.maneuver.location),
    },
    route: { legs: [{ steps }] },
  },
  destination: [121.16, 13.94],
});

const STEP_A = makeStep(121.150, 13.940, 'depart', undefined, 200);
const STEP_B = makeStep(121.152, 13.940, 'turn', 'right', 150);
const STEP_C = makeStep(121.154, 13.940, 'arrive', undefined, 0);

const routeData = makeRouteData([STEP_A, STEP_B, STEP_C]);
const floodZones = { type: 'FeatureCollection', features: [] };

describe('useNavigationStep', () => {
  it('starts on step 0', () => {
    const { result } = renderHook(() =>
      useNavigationStep(routeData, [121.150, 13.940], floodZones, vi.fn())
    );
    expect(result.current.currentStepIndex).toBe(0);
    expect(result.current.currentStep.maneuver.type).toBe('depart');
  });

  it('advances step when within 30m of next maneuver', () => {
    const { result, rerender } = renderHook(
      ({ loc }) => useNavigationStep(routeData, loc, floodZones, vi.fn()),
      { initialProps: { loc: [121.150, 13.940] } }
    );
    // Move very close to STEP_B's maneuver location (< 30m)
    act(() => {
      rerender({ loc: [121.15199, 13.940] }); // ~1m from STEP_B
    });
    expect(result.current.currentStepIndex).toBe(1);
  });

  it('does not advance before within 30m', () => {
    const { result, rerender } = renderHook(
      ({ loc }) => useNavigationStep(routeData, loc, floodZones, vi.fn()),
      { initialProps: { loc: [121.150, 13.940] } }
    );
    act(() => {
      rerender({ loc: [121.1505, 13.940] }); // ~50m away from STEP_B
    });
    expect(result.current.currentStepIndex).toBe(0);
  });

  it('returns distanceToManeuver in metres', () => {
    const { result } = renderHook(() =>
      useNavigationStep(routeData, [121.150, 13.940], floodZones, vi.fn())
    );
    expect(result.current.distanceToManeuver).toBeGreaterThan(0);
  });

  it('resets to step 0 when routeData changes', () => {
    const { result, rerender } = renderHook(
      ({ rd }) => useNavigationStep(rd, [121.152, 13.940], floodZones, vi.fn()),
      { initialProps: { rd: routeData } }
    );
    // Advance to step 1
    act(() => {});
    const newRoute = makeRouteData([
      makeStep(121.160, 13.945, 'depart', undefined, 100),
      makeStep(121.162, 13.945, 'arrive', undefined, 0),
    ]);
    act(() => { rerender({ rd: newRoute }); });
    expect(result.current.currentStepIndex).toBe(0);
  });

  it('annotates steps that intersect flood zones', () => {
    const floodedZones = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[121.1519, 13.939], [121.1521, 13.939],
            [121.1521, 13.941], [121.1519, 13.941], [121.1519, 13.939]]],
        },
        properties: { status: 'flooded' },
      }],
    };
    const { result } = renderHook(() =>
      useNavigationStep(routeData, [121.150, 13.940], floodedZones, vi.fn())
    );
    expect(result.current.stepsWithFloodWarning.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 1.2: Run tests — expect FAIL**

```bash
cd "c:/Users/Acer/Documents/toby/sanBaha"
npx vitest run src/hooks/useNavigationStep.test.js
```

Expected: `FAIL — Cannot find module './useNavigationStep'`

- [ ] **Step 1.3: Implement `useNavigationStep`**

Create `src/hooks/useNavigationStep.js`:

```js
import { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';

const ADVANCE_THRESHOLD_M = 30;
const OFF_ROUTE_THRESHOLD_M = 50;
const OFF_ROUTE_SECONDS = 5;

export default function useNavigationStep(routeData, userLocation, floodZones, onReroute) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToManeuver, setDistanceToManeuver] = useState(null);
  const [remainingDistance, setRemainingDistance] = useState(null);
  const [remainingDuration, setRemainingDuration] = useState(null);
  const [stepsWithFloodWarning, setStepsWithFloodWarning] = useState(new Set());
  const [currentLanes, setCurrentLanes] = useState(null);
  const [isOffRoute, setIsOffRoute] = useState(false);

  const offRouteTimer = useRef(null);
  const lastRerouteRef = useRef(0);
  const stepIndexRef = useRef(0);

  // Get steps array from routeData
  const steps = routeData?.safeRoute?.route?.legs?.[0]?.steps ?? [];
  const routeGeometry = routeData?.safeRoute?.geometry ?? null;

  // Reset when route changes
  useEffect(() => {
    setCurrentStepIndex(0);
    stepIndexRef.current = 0;
    setIsOffRoute(false);
    if (offRouteTimer.current) clearTimeout(offRouteTimer.current);
  }, [routeData]);

  // Annotate flood warnings once per route/floodZones change
  useEffect(() => {
    if (!steps.length || !floodZones?.features?.length) {
      setStepsWithFloodWarning(new Set());
      return;
    }
    const warned = new Set();
    steps.forEach((step, idx) => {
      if (!step.geometry?.coordinates?.length) return;
      const line = turf.lineString(step.geometry.coordinates);
      if (floodZones.features.some(zone => turf.booleanIntersects(line, zone))) {
        warned.add(idx);
      }
    });
    setStepsWithFloodWarning(warned);
  }, [routeData, floodZones]);

  // Extract lane data for current step
  useEffect(() => {
    if (!steps.length) { setCurrentLanes(null); return; }
    const step = steps[stepIndexRef.current];
    const intersection = step?.intersections?.find(i => i.lanes?.length >= 2);
    setCurrentLanes(intersection?.lanes ?? null);
  }, [currentStepIndex, routeData]);

  // Track position
  useEffect(() => {
    if (!userLocation || !steps.length || isOffRoute) return;

    const idx = stepIndexRef.current;
    const nextStep = steps[idx + 1] ?? steps[idx];
    const maneuverPt = turf.point(nextStep.maneuver.location);
    const userPt = turf.point(userLocation);

    const distM = turf.distance(userPt, maneuverPt, { units: 'meters' });
    setDistanceToManeuver(Math.round(distM));

    // Remaining distance/duration: sum of steps from current index
    const remaining = steps.slice(idx).reduce(
      (acc, s) => ({ d: acc.d + s.distance, t: acc.t + s.duration }),
      { d: 0, t: 0 }
    );
    setRemainingDistance(Math.round(remaining.d));
    setRemainingDuration(Math.round(remaining.t));

    // Advance step
    if (distM <= ADVANCE_THRESHOLD_M && idx < steps.length - 1) {
      const next = idx + 1;
      stepIndexRef.current = next;
      setCurrentStepIndex(next);
      return;
    }

    // Off-route detection
    if (routeGeometry?.coordinates?.length > 1) {
      const routeLine = turf.lineString(routeGeometry.coordinates);
      const snapped = turf.nearestPointOnLine(routeLine, userPt);
      const snapDistM = turf.distance(userPt, snapped, { units: 'meters' });

      if (snapDistM > OFF_ROUTE_THRESHOLD_M) {
        if (!offRouteTimer.current) {
          offRouteTimer.current = setTimeout(() => {
            const now = Date.now();
            if (now - lastRerouteRef.current > 15000) {
              lastRerouteRef.current = now;
              setIsOffRoute(true);
              onReroute?.(userLocation);
            }
            offRouteTimer.current = null;
          }, OFF_ROUTE_SECONDS * 1000);
        }
      } else {
        if (offRouteTimer.current) {
          clearTimeout(offRouteTimer.current);
          offRouteTimer.current = null;
        }
      }
    }
  }, [userLocation, isOffRoute]);

  // Clear isOffRoute when routeData updates (reroute completed)
  useEffect(() => {
    setIsOffRoute(false);
  }, [routeData]);

  return {
    currentStepIndex,
    currentStep: steps[currentStepIndex] ?? null,
    steps,
    distanceToManeuver,
    remainingDistance,
    remainingDuration,
    stepsWithFloodWarning,
    currentLanes,
    isOffRoute,
  };
}
```

- [ ] **Step 1.4: Run tests — expect PASS**

```bash
npx vitest run src/hooks/useNavigationStep.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/hooks/useNavigationStep.js src/hooks/useNavigationStep.test.js
git commit -m "feat: add useNavigationStep hook with step tracking, off-route detection, and flood annotation"
```

---

## Task 2: Maneuver icons utility

**Files:**
- Create: `src/utils/maneuverIcons.jsx`

No tests needed — pure presentational mapping with no logic to unit-test.

- [ ] **Step 2.1: Create `src/utils/maneuverIcons.jsx`**

```jsx
/**
 * Returns an SVG element for a Mapbox maneuver type + modifier.
 * color — hex string, defaults to '#00d4ff'
 * size  — pixel size, defaults to 20
 */
export function ManeuverIcon({ type, modifier, color = '#00d4ff', size = 20 }) {
  const s = { width: size, height: size };
  const stroke = { stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

  // Arrive
  if (type === 'arrive') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <circle cx="12" cy="12" r="4" fill={color} />
        <circle cx="12" cy="12" r="8" {...stroke} />
      </svg>
    );
  }

  // Depart
  if (type === 'depart') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <circle cx="12" cy="8" r="3" fill={color} />
        <path d="M12 11v9" {...stroke} />
      </svg>
    );
  }

  // U-turn
  if (type === 'uturn' || modifier === 'uturn') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M8 20V9a4 4 0 018 0v2M8 20l-3-3m3 3l3-3" {...stroke} />
      </svg>
    );
  }

  // Roundabout
  if (type === 'roundabout' || type === 'rotary') {
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M12 4a8 8 0 100 16A8 8 0 0012 4z" {...stroke} />
        <path d="M16 12l-4-4-4 4" {...stroke} />
      </svg>
    );
  }

  // Turn left variants
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

  // Turn right variants
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
```

- [ ] **Step 2.2: Commit**

```bash
git add src/utils/maneuverIcons.jsx
git commit -m "feat: add maneuver SVG icons for Mapbox turn types"
```

---

## Task 3: Lane guidance component

**Files:**
- Create: `src/utils/laneGuidance.jsx`

- [ ] **Step 3.1: Create `src/utils/laneGuidance.jsx`**

```jsx
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
        <LanePill key={i} lane={lane} />
      ))}
    </div>
  );
}

function LanePill({ lane }) {
  const indication = lane.indications?.[0] ?? 'straight';
  const active = lane.valid;

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
    default: // straight
      return <svg viewBox="0 0 24 24" style={s}><path d="M12 18V6M7 11l5-5 5 5" {...stroke}/></svg>;
  }
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/utils/laneGuidance.jsx
git commit -m "feat: add lane guidance diagram component"
```

---

## Task 4: `NavigationBanner` component

**Files:**
- Create: `src/components/NavigationBanner.jsx`
- Create: `src/components/NavigationBanner.test.jsx`

- [ ] **Step 4.1: Write failing tests**

Create `src/components/NavigationBanner.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NavigationBanner from './NavigationBanner';

const makeStep = (type, modifier, instruction, distance, name) => ({
  maneuver: { type, modifier, instruction, location: [121.15, 13.94] },
  distance,
  duration: 30,
  name,
  intersections: [],
  geometry: { type: 'LineString', coordinates: [[121.15, 13.94], [121.151, 13.94]] },
});

const STEPS = [
  makeStep('turn', 'right', 'Turn right onto Rizal Ave', 200, 'Rizal Ave'),
  makeStep('turn', 'left', 'Turn left onto Mabini St', 650, 'Mabini St'),
  makeStep('arrive', undefined, 'Arrive at destination', 0, ''),
];

const baseProps = {
  currentStep: STEPS[0],
  steps: STEPS,
  distanceToManeuver: 200,
  remainingDistance: 2300,
  remainingDuration: 480,
  destination: 'Mabini St',
  stepsWithFloodWarning: new Set(),
  currentLanes: null,
  isOffRoute: false,
  onEnd: vi.fn(),
};

describe('NavigationBanner', () => {
  it('renders null when no currentStep', () => {
    const { container } = render(<NavigationBanner {...baseProps} currentStep={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows instruction and distance', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.getByText('Turn right')).toBeInTheDocument();
    expect(screen.getByText(/Rizal Ave/)).toBeInTheDocument();
    expect(screen.getByText(/200m/)).toBeInTheDocument();
  });

  it('shows ETA', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.getByText('8 min')).toBeInTheDocument();
  });

  it('step list is hidden by default', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.queryByText('Turn left onto Mabini St')).not.toBeInTheDocument();
  });

  it('expands step list when banner is tapped', () => {
    render(<NavigationBanner {...baseProps} />);
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.getByText('Turn left onto Mabini St')).toBeInTheDocument();
  });

  it('shows flood warning on affected steps', () => {
    render(<NavigationBanner {...baseProps} stepsWithFloodWarning={new Set([1])} />);
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.getByText(/Flood zone/)).toBeInTheDocument();
  });

  it('shows re-routing state when isOffRoute is true', () => {
    render(<NavigationBanner {...baseProps} isOffRoute={true} />);
    expect(screen.getByText(/Re-routing/i)).toBeInTheDocument();
  });

  it('calls onEnd when End button is tapped', () => {
    const onEnd = vi.fn();
    render(<NavigationBanner {...baseProps} onEnd={onEnd} />);
    fireEvent.click(screen.getByText('End'));
    expect(onEnd).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.2: Run tests — expect FAIL**

```bash
npx vitest run src/components/NavigationBanner.test.jsx
```

Expected: `FAIL — Cannot find module './NavigationBanner'`

- [ ] **Step 4.3: Implement `NavigationBanner`**

Create `src/components/NavigationBanner.jsx`:

```jsx
import { useState } from 'react';
import { ManeuverIcon } from '../utils/maneuverIcons';
import { LaneGuidance } from '../utils/laneGuidance';

function formatDistance(metres) {
  if (metres == null) return '';
  if (metres < 1000) return `${Math.round(metres)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  if (seconds == null) return '';
  if (seconds < 60) return '< 1 min';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function NavigationBanner({
  currentStep,
  steps,
  distanceToManeuver,
  remainingDistance,
  remainingDuration,
  destination,
  stepsWithFloodWarning,
  currentLanes,
  isOffRoute,
  onEnd,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!currentStep) return null;

  const { type, modifier, instruction } = currentStep.maneuver;
  // Split instruction into verb and rest (e.g. "Turn right" + "onto Rizal Ave")
  const parts = instruction.split(' ');
  const verb = parts.slice(0, 2).join(' ');
  const rest = parts.slice(2).join(' ');

  return (
    <div className="absolute left-0 right-0 z-[1001]" style={{ top: 56 }}>
      {/* Banner header — tappable */}
      <div
        data-testid="nav-banner-header"
        onClick={() => !isOffRoute && setIsExpanded(e => !e)}
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        style={{ background: 'linear-gradient(135deg,#162d4d,#0f2035)', borderBottom: '1px solid #00d4ff22' }}
      >
        {isOffRoute ? (
          /* Re-routing state */
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-amber-400">Re-routing…</span>
          </div>
        ) : (
          <>
            {/* Maneuver icon */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#00d4ff18', border: '1.5px solid #00d4ff44' }}>
              <ManeuverIcon type={type} modifier={modifier} color="#00d4ff" size={20} />
            </div>

            {/* Instruction + lane diagram */}
            <div className="flex-1 min-w-0">
              {currentLanes && <LaneGuidance lanes={currentLanes} />}
              <div className="text-sm font-bold text-white truncate">{verb}</div>
              <div className="text-xs text-slate-400 truncate">
                {rest && <span>{rest} · </span>}
                <span className="text-[#00d4ff]">{formatDistance(distanceToManeuver)}</span>
              </div>
            </div>

            {/* ETA */}
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold text-[#00ff88]">{formatDuration(remainingDuration)}</div>
              <div className="text-xs text-slate-500">{formatDistance(remainingDistance)}</div>
            </div>

            {/* Chevron */}
            <svg className="w-3 h-3 text-slate-500 flex-shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </div>

      {/* Expanded step list */}
      {isExpanded && !isOffRoute && (
        <div className="overflow-y-auto" style={{ maxHeight: '40vh', background: '#0d1f35' }}>
          {steps.map((step, idx) => {
            const isCurrent = idx === steps.indexOf(currentStep);
            const hasFlood = stepsWithFloodWarning.has(idx);
            const stepType = step.maneuver.type;
            const stepMod = step.maneuver.modifier;
            const iconColor = isCurrent ? '#00d4ff' : '#64748b';

            return (
              <div key={idx}
                className="flex items-center gap-3 px-3 py-2"
                style={{
                  borderTop: idx > 0 ? '1px solid #1e3a5f22' : 'none',
                  borderLeft: isCurrent ? '2px solid #00d4ff' : '2px solid transparent',
                  background: isCurrent ? '#00d4ff0a' : 'transparent',
                }}>
                <div className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: isCurrent ? '#00d4ff18' : '#1e3a5f' }}>
                  <ManeuverIcon type={stepType} modifier={stepMod} color={iconColor} size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isCurrent ? 'font-semibold text-white' : 'text-slate-400'}`}>
                    {step.maneuver.instruction}
                  </div>
                  {hasFlood && (
                    <div className="text-[10px] text-amber-400">⚠ Flood zone nearby</div>
                  )}
                  {!hasFlood && (
                    <div className="text-[10px] text-slate-500">
                      {isCurrent ? formatDistance(distanceToManeuver) : formatDistance(step.distance)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer strip */}
      <div className="flex items-center justify-between px-3 py-1.5"
        style={{ background: '#0d1f35', borderTop: '1px solid #1e3a5f' }}>
        <span className="text-[10px] text-slate-500">
          To <span className="text-slate-400">{destination}</span>
        </span>
        <button
          onClick={onEnd}
          className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-red-400 active:scale-95"
          style={{ background: '#ff444422', border: '1px solid #ff444444' }}>
          End
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Run tests — expect PASS**

```bash
npx vitest run src/components/NavigationBanner.test.jsx
```

Expected: all 8 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/NavigationBanner.jsx src/components/NavigationBanner.test.jsx
git commit -m "feat: add NavigationBanner with collapsed/expanded states, lane guidance, and re-routing indicator"
```

---

## Task 5: Service worker — offline tile caching

**Files:**
- Create: `public/sw.js`
- Modify: `src/main.jsx`

The service worker is a plain script (not an ES module) because SW module support is inconsistent. It intercepts Mapbox tile requests and caches them using cache-first. The main thread sends `START_NAV` to pre-warm the cache for the route bounding box.

- [ ] **Step 5.1: Create `public/sw.js`**

```js
const TILE_CACHE = 'sanbaha-tiles-v1';
const MAPBOX_TILE_PATTERN = /api\.mapbox\.com\/v4\//;

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'START_NAV') {
    prewarmTiles(event.data.bbox, event.data.token);
  }
  if (event.data?.type === 'END_NAV') {
    caches.delete(TILE_CACHE);
  }
});

// Cache-first for Mapbox tiles during navigation
self.addEventListener('fetch', (event) => {
  if (!MAPBOX_TILE_PATTERN.test(event.request.url)) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch {
        return new Response('Tile unavailable offline', { status: 503 });
      }
    })
  );
});

// Pre-fetch tiles for zoom levels 12-15 within the route bounding box
async function prewarmTiles(bbox, token) {
  if (!bbox || !token) return;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cache = await caches.open(TILE_CACHE);
  const promises = [];

  for (let z = 12; z <= 15; z++) {
    const [xMin, yMax] = lngLatToTile(minLng, minLat, z);
    const [xMax, yMin] = lngLatToTile(maxLng, maxLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const url = `https://api.mapbox.com/v4/mapbox.streets/${z}/${x}/${y}.png?access_token=${token}`;
        promises.push(
          fetch(url)
            .then(r => { if (r.ok) cache.put(url, r); })
            .catch(() => {})
        );
        if (promises.length >= 200) break; // cap to avoid overwhelming
      }
      if (promises.length >= 200) break;
    }
    if (promises.length >= 200) break;
  }
  await Promise.allSettled(promises);
}

function lngLatToTile(lng, lat, z) {
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
  return [x, y];
}
```

- [ ] **Step 5.2: Register service worker in `src/main.jsx`**

Add after the imports, before `createRoot`:

```jsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

Full `src/main.jsx` after edit:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './App.css'
import MobileSimulator from './MobileSimulator.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AdminProvider } from './contexts/AdminContext.jsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminProvider>
          <MobileSimulator />
        </AdminProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 5.3: Commit**

```bash
git add public/sw.js src/main.jsx
git commit -m "feat: add service worker for offline Mapbox tile caching"
```

---

## Task 6: Wire everything into `App.jsx`

**Files:**
- Modify: `src/App.jsx`

The Mapbox token is defined in `src/components/FloodMap.jsx` as a module-level const. Copy that same value into App.jsx for the SW prewarm call (or extract to a shared constant — but YAGNI, just copy it).

The existing route summary panel (rendered at line ~469 when `routeData?.safeRoute && !showNavigationPanel`) must be **removed** — `NavigationBanner` replaces it.

- [ ] **Step 6.1: Add imports to `App.jsx`**

At the top of `src/App.jsx`, add after existing imports:

```js
import NavigationBanner from './components/NavigationBanner';
import useNavigationStep from './hooks/useNavigationStep';
```

- [ ] **Step 6.2: Add the Mapbox token constant and reroute handler**

After the existing `useRef` declarations (around line 72), add:

```js
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw';
```

Inside the component body, after the existing state declarations, add the reroute handler:

```js
const handleReroute = async (newOrigin) => {
  if (!destLocation?.coordinates) return;
  try {
    const result = await getSmartRouteWithAvoidance(
      newOrigin,
      destLocation.coordinates,
      hotspots
    );
    if (result.success) {
      setRouteData(result);
    }
  } catch {
    // isOffRoute will auto-clear when routeData changes; if reroute fails just wait
  }
};
```

- [ ] **Step 6.3: Add the `useNavigationStep` hook call**

After `handleReroute`, add:

```js
const {
  currentStep,
  steps,
  distanceToManeuver,
  remainingDistance,
  remainingDuration,
  stepsWithFloodWarning,
  currentLanes,
  isOffRoute,
} = useNavigationStep(routeData, userLocation, floodZones, handleReroute);
```

- [ ] **Step 6.4: Notify service worker when navigation starts**

Inside the existing `handleNavigateWithCoords` function (around line 215), after `setIsFollowMode(true)`, add:

```js
// Notify service worker to pre-warm tiles for the route bounding box
if ('serviceWorker' in navigator && navigator.serviceWorker.controller && result.safeRoute?.geometry) {
  const coords = result.safeRoute.geometry.coordinates;
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const bbox = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  navigator.serviceWorker.controller.postMessage({ type: 'START_NAV', bbox, token: MAPBOX_TOKEN });
}
```

Inside `handleStopNavigation` (around line 319), add after `setIsFollowMode(false)`:

```js
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.controller.postMessage({ type: 'END_NAV' });
}
```

- [ ] **Step 6.5: Mount `NavigationBanner` and remove old route summary panel**

In the JSX, find the old route summary panel block that starts with:
```jsx
{routeData?.safeRoute && !showNavigationPanel && (
```
and ends a few lines later with `)}`. **Delete the entire block.**

In its place (just above the `{showNavigationPanel && ...}` block), add:

```jsx
<NavigationBanner
  currentStep={currentStep}
  steps={steps}
  distanceToManeuver={distanceToManeuver}
  remainingDistance={remainingDistance}
  remainingDuration={remainingDuration}
  destination={destination}
  stepsWithFloodWarning={stepsWithFloodWarning}
  currentLanes={currentLanes}
  isOffRoute={isOffRoute}
  onEnd={handleStopNavigation}
/>
```

- [ ] **Step 6.6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (no regressions).

- [ ] **Step 6.7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: integrate NavigationBanner and useNavigationStep into App, wire reroute and SW prewarm"
```

---

## Task 7: Offline indicator in GPS status pill

**Files:**
- Modify: `src/components/FloodMap.jsx`

The GPS status pill is at the bottom-right of the map (search for `GPS Active` in FloodMap.jsx). Add an offline indicator.

- [ ] **Step 7.1: Add online state to FloodMap**

At the top of the `FloodMap` component function body, add:

```js
const [isOnline, setIsOnline] = useState(navigator.onLine);

useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);
```

- [ ] **Step 7.2: Update the GPS status pill JSX**

Find the GPS status pill block (search for `GPS Active` / `GPS Status` comment in FloodMap.jsx). Update the text span inside it:

```jsx
<span className="text-[10px] text-slate-300">
  {!isOnline ? 'Offline' :
   !isLocationAcquired ? 'Acquiring GPS…' :
   isFollowMode ? 'Navigating' : 'GPS Active'}
</span>
```

Also update the dot color:

```jsx
<span className={`w-2 h-2 rounded-full animate-pulse ${
  !isOnline ? 'bg-slate-500' :
  !isLocationAcquired ? 'bg-amber-400' :
  isFollowMode ? 'bg-[#00ff88]' : 'bg-[#00d4ff]'
}`} />
```

- [ ] **Step 7.3: Commit**

```bash
git add src/components/FloodMap.jsx
git commit -m "feat: show offline indicator in GPS status pill"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Top banner — collapsed with maneuver icon, instruction, distance, ETA | Task 4 |
| Expand on tap → scrollable step list | Task 4 |
| Lane diagram from intersection data | Task 3, Task 4 |
| Off-route detection (50m / 5s) | Task 1 |
| Auto re-routing via `getSmartRouteWithAvoidance` | Task 1 + Task 6 |
| Re-routing debounce (15s) | Task 1 |
| "Re-routing…" banner state | Task 4 |
| Flood warning on steps | Task 1 + Task 4 |
| End navigation button | Task 4 + Task 6 |
| Service worker tile cache-first | Task 5 |
| START_NAV / END_NAV messages | Task 5 + Task 6 |
| Offline indicator in GPS pill | Task 7 |
| SW registration | Task 5 |
| Replace old route summary panel | Task 6 |

All requirements covered. No gaps found.

**Type consistency check:**
- `useNavigationStep` returns `currentStep`, `steps`, `distanceToManeuver`, `remainingDistance`, `remainingDuration`, `stepsWithFloodWarning`, `currentLanes`, `isOffRoute` — all consumed by name in Task 6.
- `NavigationBanner` props match exactly what Task 6 passes.
- `ManeuverIcon` props: `type`, `modifier`, `color`, `size` — used consistently in Tasks 2, 4.
- `LaneGuidance` prop: `lanes` — used consistently in Tasks 3, 4.
