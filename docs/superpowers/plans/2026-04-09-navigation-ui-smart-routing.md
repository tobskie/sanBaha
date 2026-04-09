# Navigation UI + Smart Flood-Avoidance Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the route summary card to a compact top strip and add waypoint injection so routes actively detour around flood zones instead of just warning about them.

**Architecture:** Two independent changes: (1) replace the `bottom-[290px]` floating card JSX with a slim bar anchored below the header in `App.jsx`; (2) add `computeBypassWaypoints` and `getSmartRouteWithAvoidance` to `routingService.js`, extend `getDirections` with an optional `waypoints` param, and swap the call site in `App.jsx`. All existing routing functions stay untouched.

**Tech Stack:** React 19, @turf/turf (already installed), Mapbox Directions API v5, Vitest 4.x + @testing-library/react

**Spec reference:** `docs/superpowers/specs/2026-04-09-navigation-ui-smart-routing-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/services/routingService.js` | Add `waypoints` param to `getDirections`; add `computeBypassWaypoints`; add `getSmartRouteWithAvoidance` |
| Create | `src/services/routingService.test.js` | Unit tests for new routing functions |
| Modify | `src/App.jsx` | Swap import + call site; replace route summary card JSX |

---

## Task 1: Tests + `getDirections` waypoints param

**Files:**
- Create: `src/services/routingService.test.js`
- Modify: `src/services/routingService.js`

- [ ] **Step 1: Create test file with failing test for waypoints in URL**

Create `src/services/routingService.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @turf/turf — real geometry tested in integration, unit tests use stubs
vi.mock('@turf/turf', () => ({
  lineString: vi.fn((coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })),
  point: vi.fn((coords) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords } })),
  buffer: vi.fn((pt) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} })),
  featureCollection: vi.fn((features) => ({ type: 'FeatureCollection', features })),
  booleanIntersects: vi.fn(() => false),
  nearestPointOnLine: vi.fn((line, pt) => ({ geometry: { coordinates: [121.15, 13.95] } })),
  bearing: vi.fn(() => 45),
  destination: vi.fn((pt, dist, bearing) => ({ geometry: { coordinates: [121.16, 13.96] } })),
  centroid: vi.fn((zone) => ({ geometry: { coordinates: [121.14, 13.94] } })),
  booleanPointInPolygon: vi.fn(() => false),
}));

let fetchSpy;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      routes: [
        { geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.0]] }, duration: 600, distance: 5000 }
      ]
    })
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('getDirections', () => {
  it('builds URL with only origin and destination when no waypoints', async () => {
    const { getDirections } = await import('./routingService.js');
    await getDirections([121.1, 13.9], [121.2, 14.0]);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('121.1,13.9;121.2,14.0');
    expect(url).not.toContain('undefined');
  });

  it('inserts waypoints between origin and destination in the URL', async () => {
    const { getDirections } = await import('./routingService.js');
    await getDirections([121.1, 13.9], [121.2, 14.0], true, [[121.15, 13.95]]);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('121.1,13.9;121.15,13.95;121.2,14.0');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd c:/Users/Acer/Documents/toby/sanBaha
npx vitest run src/services/routingService.test.js
```

Expected: FAIL — "waypoints" param not yet accepted / URL format unchanged.

- [ ] **Step 3: Extend `getDirections` to accept optional waypoints**

In `src/services/routingService.js`, replace the `getDirections` function signature and URL construction:

```js
export async function getDirections(origin, destination, alternatives = true, waypoints = []) {
    const coords = [origin, ...waypoints, destination].map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching directions:', error);
        throw error;
    }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: PASS for both `getDirections` tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/routingService.js src/services/routingService.test.js
git commit -m "feat: extend getDirections with optional waypoints param"
```

---

## Task 2: `computeBypassWaypoints`

**Files:**
- Modify: `src/services/routingService.test.js`
- Modify: `src/services/routingService.js`

- [ ] **Step 1: Add failing tests for `computeBypassWaypoints`**

Append to `src/services/routingService.test.js`:

```js
import * as turf from '@turf/turf';

describe('computeBypassWaypoints', () => {
  it('returns empty array when no flood zones provided', async () => {
    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = { geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.0]] } };
    const emptyZones = { type: 'FeatureCollection', features: [] };
    const result = computeBypassWaypoints(routeLine, emptyZones);
    expect(result).toEqual([]);
  });

  it('returns one waypoint per intersected flood zone', async () => {
    turf.booleanIntersects.mockReturnValueOnce(true); // first zone intersects
    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = {
      geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.0]] }
    };
    const floodZones = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: { name: 'Quiib' } }
      ]
    };
    const result = computeBypassWaypoints(routeLine, floodZones);
    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0])).toBe(true);
    expect(result[0]).toHaveLength(2); // [lon, lat]
  });

  it('tries opposite side when first candidate is inside a flood zone', async () => {
    turf.booleanIntersects.mockReturnValueOnce(true);  // route crosses zone
    turf.booleanPointInPolygon.mockReturnValueOnce(true); // right-side candidate blocked
    const destSpy = turf.destination;
    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = {
      geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.0]] }
    };
    const floodZones = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: { name: 'Quiib' } }
      ]
    };
    computeBypassWaypoints(routeLine, floodZones);
    // destination should have been called twice (right then left)
    expect(destSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: FAIL — `computeBypassWaypoints` is not exported.

- [ ] **Step 3: Implement `computeBypassWaypoints` in `routingService.js`**

Add after the `checkRouteIntersection` function (before `findSafestRoute`):

```js
const BYPASS_DISTANCE_KM = 0.3; // 2× FLOOD_BUFFER_RADIUS

/**
 * Compute bypass waypoints that steer around intersected flood zones.
 * For each crossed zone, places a waypoint 300m perpendicular from the
 * flood center. Tries right side first; falls back to left side if that
 * candidate itself sits inside a flood zone.
 * @param {Object} safeRoute - route object with .geometry (GeoJSON LineString)
 * @param {Object} floodZones - GeoJSON FeatureCollection of flood zone polygons
 * @returns {Array} Array of [lon, lat] waypoint coordinates
 */
export function computeBypassWaypoints(safeRoute, floodZones) {
    if (!floodZones.features.length) return [];

    const routeLine = turf.lineString(safeRoute.geometry.coordinates);
    const waypoints = [];

    for (const zone of floodZones.features) {
        if (!turf.booleanIntersects(routeLine, zone)) continue;

        const floodCenter = turf.centroid(zone);
        const nearestPt = turf.nearestPointOnLine(routeLine, floodCenter);
        const bearing = turf.bearing(floodCenter, nearestPt);

        // Try right-perpendicular first
        const rightBearing = (bearing + 90) % 360;
        let candidate = turf.destination(floodCenter, BYPASS_DISTANCE_KM, rightBearing, { units: 'kilometers' });

        // If right candidate is inside any flood zone, try left
        const candidateInFlood = floodZones.features.some(z =>
            turf.booleanPointInPolygon(candidate, z)
        );
        if (candidateInFlood) {
            const leftBearing = (bearing - 90 + 360) % 360;
            candidate = turf.destination(floodCenter, BYPASS_DISTANCE_KM, leftBearing, { units: 'kilometers' });
        }

        waypoints.push(candidate.geometry.coordinates);
    }

    return waypoints;
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: PASS for all tests including the three new `computeBypassWaypoints` tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/routingService.js src/services/routingService.test.js
git commit -m "feat: add computeBypassWaypoints for flood zone detour"
```

---

## Task 3: `getSmartRouteWithAvoidance`

**Files:**
- Modify: `src/services/routingService.test.js`
- Modify: `src/services/routingService.js`

- [ ] **Step 1: Add failing tests**

Append to `src/services/routingService.test.js`:

```js
describe('getSmartRouteWithAvoidance', () => {
  it('returns immediately when initial route is dry', async () => {
    // booleanIntersects stays false (default mock) → no flood
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { type: 'LineString', coordinates: [[121.1, 13.9],[121.2,14.0]] }, duration: 600, distance: 5000 }]
      })
    });
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.0], []);
    expect(result.success).toBe(true);
    expect(result.safeRoute.isFlooded).toBe(false);
    // Only one fetch call — no retry
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries with bypass waypoints when initial route is flooded', async () => {
    turf.booleanIntersects.mockReturnValue(true); // all routes flooded
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { type: 'LineString', coordinates: [[121.1, 13.9],[121.2,14.0]] }, duration: 600, distance: 5000 }]
      })
    });
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const floodPoints = [{ id: '1', name: 'Quiib', status: 'flooded', coordinates: [13.95, 121.15], waterLevel: 1.2 }];
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.0], floodPoints);
    expect(result.success).toBe(true);
    // Two fetches: initial + retry
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.unavoidable).toBe(true); // still flooded after retry
  });

  it('returns success:false when Mapbox fetch throws', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.0], []);
    expect(result.success).toBe(false);
    expect(result.error).toBe('network error');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: FAIL — `getSmartRouteWithAvoidance` is not exported.

- [ ] **Step 3: Implement `getSmartRouteWithAvoidance` in `routingService.js`**

Add at the end of `routingService.js`, after `getSmartRoute`:

```js
/**
 * Get route with active flood zone avoidance via waypoint injection.
 * On first call, behaves identically to getSmartRoute. If the best route
 * is flooded, computes bypass waypoints and retries once.
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {Array} floodPoints - Array of flood hotspot objects
 * @returns {Promise<Object>} { success, safeRoute, allRoutes, floodZones, warnings, unavoidable, origin, destination }
 */
export async function getSmartRouteWithAvoidance(origin, destination, floodPoints) {
    try {
        // Step 1: Initial fetch using existing smart route logic
        const initial = await getSmartRoute(origin, destination, floodPoints);
        if (!initial.success) return initial;
        if (!initial.safeRoute.isFlooded) return { ...initial, unavoidable: false };

        // Step 2: Compute bypass waypoints for each crossed flood zone
        const bypassWaypoints = computeBypassWaypoints(initial.safeRoute, initial.floodZones);

        // Step 3: Retry with waypoints
        const retryData = await getDirections(origin, destination, true, bypassWaypoints);
        if (!retryData.routes || retryData.routes.length === 0) {
            return { ...initial, unavoidable: true };
        }

        const retryAnalysis = findSafestRoute(retryData.routes, initial.floodZones);
        return {
            success: true,
            ...retryAnalysis,
            floodZones: initial.floodZones,
            origin,
            destination,
            unavoidable: retryAnalysis.safeRoute.isFlooded,
        };
    } catch (error) {
        console.error('Smart routing error:', error);
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 4: Run all tests — confirm pass**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: PASS for all tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/routingService.js src/services/routingService.test.js
git commit -m "feat: add getSmartRouteWithAvoidance with waypoint injection"
```

---

## Task 4: Wire `getSmartRouteWithAvoidance` into App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Swap import**

In `src/App.jsx`, find the routing import on line 14:

```js
import { getSmartRoute, createFloodZones, formatDuration, formatDistance, checkRouteIntersection } from './services/routingService';
```

Replace with:

```js
import { getSmartRouteWithAvoidance, createFloodZones, formatDuration, formatDistance, checkRouteIntersection } from './services/routingService';
```

- [ ] **Step 2: Swap call site in `handleNavigateWithCoords`**

Find (around line 198):
```js
const result = await getSmartRoute(origin, dest, hotspots);
```

Replace with:
```js
const result = await getSmartRouteWithAvoidance(origin, dest, hotspots);
```

- [ ] **Step 3: Update toast message for unavoidable routes**

Find (around line 205):
```js
setToast({ message: 'Route found! Follow blue line.', type: 'info' });
```

Replace with:
```js
setToast({
  message: result.unavoidable
    ? 'Only available route crosses a flood zone. Proceed with caution.'
    : 'Route found! Follow blue line.',
  type: result.unavoidable ? 'warning' : 'info'
});
```

- [ ] **Step 4: Run dev server and verify no errors**

```bash
npm run dev
```

Open the app. Navigate to a destination. Confirm: route plots correctly, toast message appears, no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: use getSmartRouteWithAvoidance in navigation handler"
```

---

## Task 5: Compact top-strip route summary card

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Replace the route summary card JSX block**

In `src/App.jsx`, find the entire block from line 420 to 486:

```jsx
      {/* Route Summary Card */}
      {routeData?.safeRoute && !showNavigationPanel && (
        <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
          <div className={`glass rounded-2xl p-3 shadow-xl border ${routeData.safeRoute.isFlooded
            ? 'border-red-500/30'
            : 'border-emerald-500/30'
            }`}>
```

Replace the entire block (from the `{/* Route Summary Card */}` comment through the closing `</div>\n      )}`) with:

```jsx
      {/* Route Summary Card — compact top strip */}
      {routeData?.safeRoute && !showNavigationPanel && (
        <div className="absolute left-0 right-0 top-[56px] z-[1001]">
          <div className={`flex items-center gap-2 px-3 py-2 border-b backdrop-blur-md ${
            routeData.unavoidable
              ? 'bg-amber-900/80 border-amber-500/30'
              : routeData.safeRoute.isFlooded
                ? 'bg-red-900/80 border-red-500/30'
                : 'bg-[#0a1628]/90 border-emerald-500/20'
          }`}>
            {/* Status dot */}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              routeData.unavoidable || routeData.safeRoute.isFlooded
                ? routeData.unavoidable ? 'bg-amber-400' : 'bg-red-400'
                : 'bg-emerald-400'
            }`} />
            {/* Destination */}
            <span className="text-white text-xs font-semibold truncate flex-1">
              {destination || 'Route'}
            </span>
            {/* ETA */}
            <span className="text-[#00d4ff] text-xs font-bold flex-shrink-0">
              {formatDuration(routeData.safeRoute.duration)}
            </span>
            <span className="text-slate-500 text-xs flex-shrink-0">·</span>
            {/* Distance */}
            <span className="text-slate-300 text-xs flex-shrink-0">
              {formatDistance(routeData.safeRoute.distance)}
            </span>
            {/* Flood warning pill */}
            {(routeData.safeRoute.isFlooded || routeData.unavoidable) && routeData.warnings?.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px] font-semibold flex-shrink-0">
                ⚠ {routeData.warnings.map(w => w.name).join(', ')}
              </span>
            )}
            {/* Close */}
            <button
              onClick={handleClearRoute}
              className="w-6 h-6 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95 flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verify in dev**

```bash
npm run dev
```

Check:
- Before navigating: no strip visible, map shows fully.
- After navigating: slim bar appears directly below the app header. Shows green dot + destination + ETA + distance.
- If a route crosses a flood zone: amber dot + amber pill with zone name.
- Close button (✕) clears the route and removes the strip.
- BottomSheet and FloatingActions are completely unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: move route summary to compact top strip below header

Replaces bottom-[290px] floating card with a slim bar anchored
at top-[56px]. Map is fully visible while navigating.
"
```