# Routing Accuracy + Rain Gauge Precautionary Zones — Design Spec
**Date:** 2026-04-09
**Project:** sanBaha flood monitoring app

---

## Overview

Two improvements to the routing and flood detection system:

1. **Bracket waypoint routing** — replace the single-centroid bypass waypoint with two bracketing waypoints (entry + exit) that force Mapbox onto a genuinely different street around flood zones.
2. **Rain gauge precautionary zones** — use the `rain_mm` field already pushed by the ESP32 sensor to classify sensors as precautionary risk before water level rises, routing around them at a lower penalty.

Both changes are confined to `src/services/routingService.js` and `src/data/mockData.js` (threshold constant only). No Firebase schema changes, no new dependencies.

---

## Part 1 — Bracket Waypoint Routing

### Problem with current approach

`computeBypassWaypoints` places one waypoint 300m perpendicular from the flood zone *centroid*. Mapbox snaps that waypoint to the nearest road — which is often the flooded road itself, because the centroid offset doesn't reliably land on a parallel street. The result is the router still traverses the flood zone.

### New approach — entry/exit bracket

For each flood zone the route intersects:

1. **Find crossing points** — `turf.lineIntersect(routeLine, floodZonePolygon)` returns the exact coordinates where the route crosses the zone boundary. This typically yields 2 points (entry + exit). If fewer than 2 points are returned (route endpoint is inside the zone, or tangent touch), fall back to the existing single-centroid approach for that zone.

2. **Order by route progress** — for each intersection point, call `turf.nearestPointOnLine(routeLine, point)` to get its `properties.location` (distance along the line). Sort the two points by this value so index 0 = entry, index 1 = exit.

3. **Compute perpendicular bearing** — at the entry point, take the bearing of the route segment immediately after it using `turf.bearing(entryPoint, exitPoint)`. The perpendicular offset bearing is `(segmentBearing + 90 + 360) % 360` (right side first).

4. **Place entry waypoint** — `turf.destination(entryPoint, 0.45, perpBearing, { units: 'kilometers' })`. 450m offset (3× the 150m flood buffer radius).

5. **Place exit waypoint** — `turf.destination(exitPoint, 0.45, perpBearing, { units: 'kilometers' })`. Same perpendicular direction as the entry waypoint so both points are on the same side of the road.

6. **Check for flood overlap** — if either waypoint lands inside any flood zone, flip to the opposite side: `(perpBearing + 180) % 360`.

7. **Insert in order** — waypoints array receives `[entryWaypoint, exitWaypoint]` for this zone, in route-progress order.

When multiple flood zones are crossed, bracket pairs for each zone are appended in the order they appear along the route.

**Offset distance:** 300m → **450m** (ensures clearance beyond adjacent road shoulders onto a parallel street).

**Fallback:** If `turf.lineIntersect` returns 0 or 1 points for a zone, fall back to the existing single-centroid method for that zone only (preserve current behavior as safety net).

### Function signature (unchanged externally)

```js
export function computeBypassWaypoints(safeRoute, floodZones)
// Returns: Array of [lon, lat] waypoint coordinates
```

The caller (`getSmartRouteWithAvoidance`) and its tests are unaffected by this internal change.

---

## Part 2 — Rain Gauge Precautionary Zones

### Sensor data

The ESP32 already pushes `rain_mm` (cumulative tipping bucket count × 0.2mm/tip) to `/flood_sensors/{id}` every 5 seconds. The field is already present on every `floodPoint` object received from `subscribeToFloodData` in `firebase.js`.

### New status tier: `precautionary`

A sensor is classified as precautionary when:
- `rain_mm >= RAIN_PRECAUTION_THRESHOLD` (25mm) **AND**
- `status === 'clear'` (water level hasn't crossed the warning threshold yet)

This is evaluated inside `createFloodZones` only — `getStatusFromWaterLevel` in `mockData.js` is unchanged.

### Constant

Add to `routingService.js`:
```js
export const RAIN_PRECAUTION_THRESHOLD = 25; // mm — moderate rainfall, road ponding likely
```

Exported so tests can import it directly without magic numbers.

### Buffer radius by status

| Status | Buffer radius | Rationale |
|---|---|---|
| `precautionary` | 100m | Pre-emptive caution, zone may not be flooded yet |
| `warning` | 150m | Current value (unchanged) |
| `flooded` | 150m | Current value (unchanged) |

### Penalty in `findSafestRoute`

| Status | Penalty | Effect |
|---|---|---|
| `precautionary` | 500,000 | Avoided if dry alternative exists; used if no other way |
| `warning` / `flooded` | 1,000,000 + (zones × 10,000) | Current value (unchanged) |

Precautionary penalty is half of flooded, so the router prefers dry > precautionary > flooded when choosing between alternatives.

### `createFloodZones` change

Current filter:
```js
const floodedPoints = floodPoints.filter(p => p.status === 'flooded' || p.status === 'warning');
```

New logic:
```js
const relevantPoints = floodPoints.filter(p =>
  p.status === 'flooded' ||
  p.status === 'warning' ||
  (p.status === 'clear' && (p.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
);
```

For each point, derive `zoneStatus`:
```js
const zoneStatus = (p.status === 'clear' && (p.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
  ? 'precautionary'
  : p.status;
```

Buffer radius and properties use `zoneStatus`.

### UI — route strip pill

The existing flood warning pill condition:
```jsx
{(routeData.safeRoute.isFlooded || routeData.unavoidable) && routeData.warnings?.length > 0 && ...}
```

Extends to also show a yellow pill when the route passes near a precautionary zone:
```jsx
{routeData.precautionaryWarnings?.length > 0 && (
  <span className="... bg-yellow-500/20 border-yellow-500/30 text-yellow-300 ...">
    ⚠ High rainfall near route
  </span>
)}
```

`precautionaryWarnings` is a new field returned by `findSafestRoute` — array of precautionary zone properties from the best route's `floodedZones` list filtered to `status === 'precautionary'`.

---

## Files changed

| File | Change |
|------|--------|
| `src/services/routingService.js` | Rewrite `computeBypassWaypoints` for bracket approach; add `RAIN_PRECAUTION_THRESHOLD`; update `createFloodZones` for precautionary; update `findSafestRoute` penalty logic and `precautionaryWarnings` field |
| `src/App.jsx` | Add `precautionaryWarnings` pill to route strip |

No changes to: `firebase.js`, `mockData.js`, `hardware/`, database schema, or Cloud Functions.

---

## Out of scope

- Storing historical `rain_mm` or computing rainfall rate (mm/hr) — cumulative total is sufficient for threshold detection.
- Resetting `rain_mm` on the device (hardware concern, not app concern).
- Multi-bracket iteration (more than one retry pass).
- Turn-by-turn instructions.
