# Routing Accuracy + Rain Gauge Precautionary Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bypass waypoint routing to bracket flood zones with entry+exit waypoints, and add rain gauge precautionary zone detection using the `rain_mm` field pushed by the ESP32 sensor.

**Architecture:** Two focused changes to `src/services/routingService.js`: (1) rewrite `computeBypassWaypoints` to use `turf.lineIntersect` for entry/exit bracket points instead of a single centroid offset; (2) add `RAIN_PRECAUTION_THRESHOLD`, update `createFloodZones` to classify sensors with `rain_mm >= 25` as precautionary, and update `findSafestRoute` to return `precautionaryWarnings`. One UI pill added to `src/App.jsx`. Existing tests updated to match the new bracket behavior.

**Tech Stack:** React 19, @turf/turf (already installed — adding `lineIntersect`), Mapbox Directions API v5, Vitest 4.x

**Spec reference:** `docs/superpowers/specs/2026-04-09-routing-accuracy-rain-gauge-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/services/routingService.js` | Bracket waypoint logic; rain precaution constant + zone creation; precautionaryWarnings in findSafestRoute |
| Modify | `src/services/routingService.test.js` | Update computeBypassWaypoints tests; add createFloodZones + findSafestRoute precaution tests |
| Modify | `src/App.jsx` | Add precautionaryWarnings pill to route strip |

---

## Task 1: Add `turf.lineIntersect` to mock and update `computeBypassWaypoints` tests

The current `computeBypassWaypoints` tests assert "one waypoint per intersected zone" (single-centroid behavior). The new bracket approach returns **two** waypoints per zone. Update the tests first so they describe the target behavior before we change the implementation.

**Files:**
- Modify: `src/services/routingService.test.js`

- [ ] **Step 1: Add `lineIntersect` to the turf mock at the top of the test file**

The `vi.mock('@turf/turf', ...)` block at lines 4–15 does not include `lineIntersect`. Find that block and add it:

```js
vi.mock('@turf/turf', () => ({
  lineString: vi.fn((coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })),
  point: vi.fn((coords) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords } })),
  buffer: vi.fn((pt) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} })),
  featureCollection: vi.fn((features) => ({ type: 'FeatureCollection', features })),
  booleanIntersects: vi.fn(() => false),
  nearestPointOnLine: vi.fn((line, pt) => ({ geometry: { coordinates: [121.15, 13.95] }, properties: { location: 100 } })),
  bearing: vi.fn(() => 45),
  destination: vi.fn((pt, dist, bearing) => ({ geometry: { coordinates: [121.16, 13.96] } })),
  centroid: vi.fn((zone) => ({ geometry: { coordinates: [121.14, 13.94] } })),
  booleanPointInPolygon: vi.fn(() => false),
  lineIntersect: vi.fn(() => ({ features: [] })),
}));
```

Note: `nearestPointOnLine` mock now returns `properties: { location: 100 }` — this is needed in Task 2 for the bracket point ordering logic.

- [ ] **Step 2: Replace the three `computeBypassWaypoints` tests**

Find the `describe('computeBypassWaypoints', ...)` block (lines 52–97) and replace it entirely with:

```js
describe('computeBypassWaypoints', () => {
  it('returns empty array when no flood zones provided', async () => {
    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = { geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.1]] } };
    const emptyZones = { type: 'FeatureCollection', features: [] };
    const result = computeBypassWaypoints(routeLine, emptyZones);
    expect(result).toEqual([]);
  });

  it('returns two waypoints (entry+exit bracket) per intersected flood zone', async () => {
    // booleanIntersects: route crosses the zone
    turf.booleanIntersects.mockReturnValueOnce(true);
    // lineIntersect returns two crossing points (entry + exit)
    turf.lineIntersect.mockReturnValueOnce({
      features: [
        { geometry: { coordinates: [121.12, 13.92] } },
        { geometry: { coordinates: [121.14, 13.94] } },
      ]
    });
    // nearestPointOnLine: entry at location 50, exit at location 150 (sorted order)
    turf.nearestPointOnLine
      .mockReturnValueOnce({ geometry: { coordinates: [121.12, 13.92] }, properties: { location: 50 } })
      .mockReturnValueOnce({ geometry: { coordinates: [121.14, 13.94] }, properties: { location: 150 } });

    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = {
      geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.1]] }
    };
    const floodZones = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: { name: 'Quiib' } }
      ]
    };
    const result = computeBypassWaypoints(routeLine, floodZones);
    // Two waypoints: one at entry, one at exit
    expect(result).toHaveLength(2);
    expect(Array.isArray(result[0])).toBe(true);
    expect(result[0]).toHaveLength(2); // [lon, lat]
    expect(result[1]).toHaveLength(2);
  });

  it('falls back to single centroid waypoint when lineIntersect returns fewer than 2 points', async () => {
    turf.booleanIntersects.mockReturnValueOnce(true);
    // Only one intersection point (route endpoint is inside zone)
    turf.lineIntersect.mockReturnValueOnce({ features: [{ geometry: { coordinates: [121.12, 13.92] } }] });

    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = {
      geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.1]] }
    };
    const floodZones = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: { name: 'Quiib' } }
      ]
    };
    const result = computeBypassWaypoints(routeLine, floodZones);
    // Fallback: single waypoint from centroid approach
    expect(result).toHaveLength(1);
  });

  it('flips to opposite side when bracket waypoints land inside a flood zone', async () => {
    turf.booleanIntersects.mockReturnValueOnce(true);
    turf.lineIntersect.mockReturnValueOnce({
      features: [
        { geometry: { coordinates: [121.12, 13.92] } },
        { geometry: { coordinates: [121.14, 13.94] } },
      ]
    });
    turf.nearestPointOnLine
      .mockReturnValueOnce({ geometry: { coordinates: [121.12, 13.92] }, properties: { location: 50 } })
      .mockReturnValueOnce({ geometry: { coordinates: [121.14, 13.94] }, properties: { location: 150 } });
    // Right-side candidates are inside a flood zone
    turf.booleanPointInPolygon.mockReturnValue(true);

    const destSpy = turf.destination;
    const { computeBypassWaypoints } = await import('./routingService.js');
    const routeLine = {
      geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.1]] }
    };
    const floodZones = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: { name: 'Quiib' } }
      ]
    };
    computeBypassWaypoints(routeLine, floodZones);
    // destination called 4 times: right entry, left entry (flipped), right exit, left exit (flipped)
    expect(destSpy).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 3: Run tests — confirm the 3 updated computeBypassWaypoints tests now FAIL**

```bash
cd c:/Users/Acer/Documents/toby/sanBaha
npx vitest run src/services/routingService.test.js
```

Expected: `computeBypassWaypoints` tests fail (implementation not yet updated). `getDirections` and `getSmartRouteWithAvoidance` tests still pass.

- [ ] **Step 4: Commit the updated tests**

```bash
git add src/services/routingService.test.js
git commit -m "test: update computeBypassWaypoints tests for bracket waypoint behavior"
```

---

## Task 2: Rewrite `computeBypassWaypoints` with bracket approach

**Files:**
- Modify: `src/services/routingService.js`

- [ ] **Step 1: Update the `BYPASS_DISTANCE_KM` constant**

In `src/services/routingService.js`, find:
```js
const BYPASS_DISTANCE_KM = 0.3; // 2× FLOOD_BUFFER_RADIUS
```

Replace with:
```js
const BYPASS_DISTANCE_KM = 0.45; // 3× FLOOD_BUFFER_RADIUS — clears adjacent parallel streets
```

- [ ] **Step 2: Replace `computeBypassWaypoints` implementation**

Find the entire `computeBypassWaypoints` function (from the JSDoc `/**` through the closing `}`) and replace it with:

```js
/**
 * Compute bracket bypass waypoints around flood zones.
 * Places two waypoints per crossed zone — one at the route entry point into
 * the zone, one at the exit point — both offset 450m perpendicular to the
 * route direction. This forces Mapbox to route around the zone rather than
 * snapping the waypoint back to the flooded road.
 *
 * Falls back to single centroid waypoint if lineIntersect returns < 2 points
 * (e.g. route endpoint is inside the zone).
 *
 * @param {Object} safeRoute - route object with .geometry (raw GeoJSON LineString geometry, not a Feature)
 * @param {Object} floodZones - GeoJSON FeatureCollection of flood zone polygons
 * @returns {Array} Array of [lon, lat] waypoint coordinates in route-progress order
 */
export function computeBypassWaypoints(safeRoute, floodZones) {
    if (!floodZones.features.length) return [];

    const routeLine = turf.lineString(safeRoute.geometry.coordinates);
    const waypoints = [];

    for (const zone of floodZones.features) {
        if (!turf.booleanIntersects(routeLine, zone)) continue;

        // Find exact entry and exit points on the zone boundary
        const intersections = turf.lineIntersect(routeLine, zone);

        if (intersections.features.length < 2) {
            // Fallback: single centroid offset (original behavior)
            const floodCenter = turf.centroid(zone);
            const nearestPt = turf.nearestPointOnLine(routeLine, floodCenter);
            const bearing = turf.bearing(floodCenter, nearestPt);
            const rightBearing = (bearing + 90 + 360) % 360;
            let candidate = turf.destination(floodCenter, BYPASS_DISTANCE_KM, rightBearing, { units: 'kilometers' });
            const candidateInFlood = floodZones.features.some(z => turf.booleanPointInPolygon(candidate, z));
            if (candidateInFlood) {
                const leftBearing = (bearing - 90 + 360) % 360;
                candidate = turf.destination(floodCenter, BYPASS_DISTANCE_KM, leftBearing, { units: 'kilometers' });
            }
            waypoints.push(candidate.geometry.coordinates);
            continue;
        }

        // Sort intersection points by their distance along the route
        const ordered = intersections.features
            .map(f => {
                const onLine = turf.nearestPointOnLine(routeLine, f);
                return { coords: f.geometry.coordinates, location: onLine.properties.location };
            })
            .sort((a, b) => a.location - b.location);

        const entryPt = ordered[0].coords;
        const exitPt = ordered[ordered.length - 1].coords;

        // Perpendicular bearing based on entry→exit segment direction
        const segBearing = turf.bearing(turf.point(entryPt), turf.point(exitPt));
        const rightPerp = (segBearing + 90 + 360) % 360;
        const leftPerp = (segBearing - 90 + 360) % 360;

        // Place entry and exit waypoints on the same side (right first)
        let entryCandidate = turf.destination(turf.point(entryPt), BYPASS_DISTANCE_KM, rightPerp, { units: 'kilometers' });
        let exitCandidate = turf.destination(turf.point(exitPt), BYPASS_DISTANCE_KM, rightPerp, { units: 'kilometers' });

        // If either candidate lands inside a flood zone, flip both to left side
        const eitherInFlood = floodZones.features.some(z =>
            turf.booleanPointInPolygon(entryCandidate, z) || turf.booleanPointInPolygon(exitCandidate, z)
        );
        if (eitherInFlood) {
            entryCandidate = turf.destination(turf.point(entryPt), BYPASS_DISTANCE_KM, leftPerp, { units: 'kilometers' });
            exitCandidate = turf.destination(turf.point(exitPt), BYPASS_DISTANCE_KM, leftPerp, { units: 'kilometers' });
        }

        waypoints.push(entryCandidate.geometry.coordinates);
        waypoints.push(exitCandidate.geometry.coordinates);
    }

    return waypoints;
}
```

- [ ] **Step 3: Run tests — confirm computeBypassWaypoints tests pass**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: All 9 tests pass (4 updated `computeBypassWaypoints` tests + 5 others).

- [ ] **Step 4: Commit**

```bash
git add src/services/routingService.js
git commit -m "feat: rewrite computeBypassWaypoints with entry/exit bracket approach

Uses turf.lineIntersect to find exact zone crossing points and places
waypoints at both entry and exit, forcing Mapbox onto a parallel street.
Offset increased 300m → 450m. Falls back to centroid for edge cases."
```

---

## Task 3: Rain gauge precautionary zones

**Files:**
- Modify: `src/services/routingService.js`
- Modify: `src/services/routingService.test.js`

- [ ] **Step 1: Add failing tests for `createFloodZones` precautionary behavior**

Append to `src/services/routingService.test.js` after the `describe('computeBypassWaypoints')` block and before `describe('getSmartRouteWithAvoidance')`:

```js
describe('createFloodZones', () => {
  it('excludes clear sensors with rain_mm below threshold', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const points = [{ id: '1', name: 'Sensor A', status: 'clear', rain_mm: 10, coordinates: [13.9, 121.1], waterLevel: 5 }];
    const result = createFloodZones(points);
    expect(result.features).toHaveLength(0);
  });

  it('includes clear sensors with rain_mm >= 25 as precautionary', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const points = [{ id: '1', name: 'Sensor A', status: 'clear', rain_mm: 25, coordinates: [13.9, 121.1], waterLevel: 5 }];
    const result = createFloodZones(points);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.status).toBe('precautionary');
  });

  it('still includes flooded and warning sensors regardless of rain_mm', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const points = [
      { id: '1', name: 'A', status: 'flooded', rain_mm: 0, coordinates: [13.9, 121.1], waterLevel: 80 },
      { id: '2', name: 'B', status: 'warning', rain_mm: 0, coordinates: [13.91, 121.11], waterLevel: 30 },
    ];
    const result = createFloodZones(points);
    expect(result.features).toHaveLength(2);
  });
});

describe('findSafestRoute precautionary penalties', () => {
  it('applies lower penalty (500000) to precautionary zones than flooded (1000000)', async () => {
    // Make booleanIntersects return true so the route is considered to cross the zone
    turf.booleanIntersects.mockReturnValue(true);
    const { findSafestRoute } = await import('./routingService.js');
    const routes = [
      { geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.1]] }, duration: 300, distance: 3000 }
    ];
    const precautionaryZones = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[]] },
        properties: { name: 'Sensor A', status: 'precautionary' }
      }]
    };
    const result = findSafestRoute(routes, precautionaryZones);
    // score = 500000 + 300 (duration) = 500300 — not 1000000+
    expect(result.safeRoute.score).toBe(500300);
  });

  it('returns precautionaryWarnings with zones whose status is precautionary', async () => {
    turf.booleanIntersects.mockReturnValue(true);
    const { findSafestRoute } = await import('./routingService.js');
    const routes = [
      { geometry: { type: 'LineString', coordinates: [[121.1, 13.9], [121.2, 14.1]] }, duration: 300, distance: 3000 }
    ];
    const zones = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[]] },
        properties: { name: 'Sensor A', status: 'precautionary' }
      }]
    };
    const result = findSafestRoute(routes, zones);
    expect(result.precautionaryWarnings).toHaveLength(1);
    expect(result.precautionaryWarnings[0].name).toBe('Sensor A');
  });
});
```

- [ ] **Step 2: Run to confirm new tests FAIL**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: The 5 new tests fail. Existing 9 still pass.

- [ ] **Step 3: Add `RAIN_PRECAUTION_THRESHOLD` constant and update `createFloodZones`**

In `src/services/routingService.js`, after `const FLOOD_BUFFER_RADIUS = 0.15;` add:

```js
export const RAIN_PRECAUTION_THRESHOLD = 25; // mm — moderate rainfall (25mm), road ponding likely
const PRECAUTIONARY_BUFFER_RADIUS = 0.10; // 100m — smaller buffer for pre-emptive caution
```

Then replace the `createFloodZones` function:

```js
/**
 * Create circular buffer polygons around flood points.
 * Includes flooded/warning sensors at 150m radius and clear sensors
 * with rain_mm >= RAIN_PRECAUTION_THRESHOLD at 100m radius (precautionary).
 * @param {Array} floodPoints - Array of flood hotspot objects
 * @returns {Object} GeoJSON FeatureCollection of flood zones
 */
export function createFloodZones(floodPoints) {
    const relevantPoints = floodPoints.filter(p =>
        p.status === 'flooded' ||
        p.status === 'warning' ||
        (p.status === 'clear' && (p.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
    );

    const features = relevantPoints.map(point => {
        const zoneStatus = (point.status === 'clear' && (point.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
            ? 'precautionary'
            : point.status;

        const radius = zoneStatus === 'precautionary' ? PRECAUTIONARY_BUFFER_RADIUS : FLOOD_BUFFER_RADIUS;
        const center = turf.point([point.coordinates[1], point.coordinates[0]]);
        const buffer = turf.buffer(center, radius, { units: 'kilometers' });
        buffer.properties = {
            id: point.id,
            name: point.name,
            status: zoneStatus,
            waterLevel: point.waterLevel,
            rain_mm: point.rain_mm ?? 0,
        };
        return buffer;
    });

    return turf.featureCollection(features);
}
```

- [ ] **Step 4: Update `findSafestRoute` to apply precautionary penalty and return `precautionaryWarnings`**

Replace the `findSafestRoute` function:

```js
/**
 * Find the shortest dry path from alternatives.
 * Priority: 1. Avoid flooded/warning areas  2. Avoid precautionary areas  3. Shortest duration
 * @param {Array} routes - Array of route objects from Mapbox
 * @param {Object} floodZones - GeoJSON flood zones (may include precautionary zones)
 * @returns {Object} { safeRoute, allRoutes, hasSafeRoute, warnings, precautionaryWarnings }
 */
export function findSafestRoute(routes, floodZones) {
    const analyzedRoutes = routes.map((route, index) => {
        const routeGeoJSON = {
            type: 'Feature',
            geometry: route.geometry
        };

        const intersection = checkRouteIntersection(routeGeoJSON, floodZones);

        let floodPenalty = 0;
        if (intersection.intersects) {
            const hasPrecautionaryOnly = intersection.intersectedZones.every(z => z.status === 'precautionary');
            floodPenalty = hasPrecautionaryOnly
                ? 500000
                : 1000000 + (intersection.intersectedZones.length * 10000);
        }

        return {
            index,
            route,
            geometry: route.geometry,
            duration: route.duration,
            distance: route.distance,
            isFlooded: intersection.intersects && intersection.intersectedZones.some(z => z.status !== 'precautionary'),
            floodedZones: intersection.intersectedZones,
            score: floodPenalty + route.duration
        };
    });

    analyzedRoutes.sort((a, b) => a.score - b.score);

    const safeRoutes = analyzedRoutes.filter(r => !r.isFlooded);
    const safeRoute = analyzedRoutes[0];

    const precautionaryWarnings = safeRoute.floodedZones.filter(z => z.status === 'precautionary');

    return {
        safeRoute,
        allRoutes: analyzedRoutes,
        hasSafeRoute: safeRoutes.length > 0,
        warnings: safeRoute.isFlooded ? safeRoute.floodedZones.filter(z => z.status !== 'precautionary') : [],
        precautionaryWarnings,
    };
}
```

- [ ] **Step 5: Run all tests — confirm 14 pass**

```bash
npx vitest run src/services/routingService.test.js
```

Expected: 14 tests pass (9 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/services/routingService.js src/services/routingService.test.js
git commit -m "feat: add rain gauge precautionary zones to routing

Sensors with rain_mm >= 25 classified as precautionary (100m buffer,
500k penalty). findSafestRoute returns precautionaryWarnings field.
RAIN_PRECAUTION_THRESHOLD exported for reuse."
```

---

## Task 4: Precautionary warning pill in route strip UI

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add precautionary pill after the existing flood warning pill**

In `src/App.jsx`, find the flood warning pill (around line 456–461):

```jsx
            {/* Flood warning pill */}
            {(routeData.safeRoute.isFlooded || routeData.unavoidable) && routeData.warnings?.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px] font-semibold flex-shrink-0">
                ⚠ {routeData.warnings.map(w => w.name).join(', ')}
              </span>
            )}
```

Add the precautionary pill immediately after it:

```jsx
            {/* Rain precaution pill */}
            {routeData.precautionaryWarnings?.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-[9px] font-semibold flex-shrink-0">
                🌧 High rainfall near route
              </span>
            )}
```

- [ ] **Step 2: Verify dev server starts cleanly**

```bash
cd c:/Users/Acer/Documents/toby/sanBaha
npm run dev
```

Confirm it starts without errors. Kill the server.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All test files pass (14 routing tests + other existing tests).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add rain precaution pill to route strip UI

Shows yellow pill when route passes near a high-rainfall sensor
(rain_mm >= 25mm) even if water level hasn't risen yet."
```
