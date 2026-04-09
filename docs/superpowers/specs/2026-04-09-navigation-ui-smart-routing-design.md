# Navigation UI + Smart Flood-Avoidance Routing — Design Spec
**Date:** 2026-04-09
**Project:** sanBaha flood monitoring app

---

## Overview

Two improvements to the navigation experience:

1. **Route summary card** — move from a floating overlay that blocks the map to a compact strip anchored below the header.
2. **Smart routing** — add waypoint injection so the router actively detours around flood zones instead of just warning about them.

Both changes are additive. No existing state, hooks, or Firebase logic is touched.

---

## Part 1 — Route Summary Card Layout

### Current state
The active-route card is positioned at `bottom-[290px]` in `App.jsx`, floating over the map center. It contains the destination name, a status label, a 2-column ETA/distance grid, a flood warning block, and a close button.

### New layout — top compact strip

**Position:** `absolute top-[56px] left-0 right-0 z-[1001]` (directly below the `MobileHeader` which is `top-0`).

**Structure:** Single row inside a slim glassmorphism bar:
```
[●status dot] [Destination name] [ETA] [·] [distance] [⚠ pill if flooded] [✕]
```

- Status dot: green (`bg-emerald-400`) for safe, amber (`bg-amber-400`) for unavoidable flood, red (`bg-red-400`) for flooded.
- ETA and distance are plain text, not grid cards.
- Flood warning collapses into an inline amber pill (e.g. `⚠ Quiib`) instead of a separate block. Tapping the pill does nothing (display only).
- Close button (`✕`) calls existing `handleClearRoute`.
- Height: ~40px. No impact on BottomSheet or FloatingActions positioning.

**Files changed:** `src/App.jsx` — replace the existing route summary card JSX block only. No other changes.

---

## Part 2 — Smart Flood-Avoidance Routing (Waypoint Injection)

### Current state
`getSmartRoute` in `routingService.js` fetches up to 3 Mapbox alternatives and picks the one with the lowest score (flood penalty + duration). If all alternatives cross a flood zone, it returns the least-bad route and shows a warning. No active avoidance occurs.

### New function — `getSmartRouteWithAvoidance`

Replaces the `getSmartRoute` call in `App.jsx`. Existing functions (`getSmartRoute`, `findSafestRoute`, `checkRouteIntersection`, `createFloodZones`, `getDirections`) are unchanged.

#### Algorithm

```
getSmartRouteWithAvoidance(origin, destination, floodPoints):
  1. result = getSmartRoute(origin, destination, floodPoints)
  2. if !result.success → return result (propagate error)
  3. if !result.safeRoute.isFlooded → return result (already dry, done)
  4. bypassWaypoints = computeBypassWaypoints(result.safeRoute, result.floodZones)
  5. directionsData = getDirections(origin, destination, true, waypoints=bypassWaypoints)
  6. newAnalysis = findSafestRoute(directionsData.routes, result.floodZones)
  7. return { ...newAnalysis, floodZones: result.floodZones, origin, destination,
               unavoidable: newAnalysis.safeRoute.isFlooded }
```

#### Bypass waypoint computation

```
computeBypassWaypoints(safeRoute, floodZones):
  waypoints = []
  routeLine = turf.lineString(safeRoute.geometry.coordinates)
  for each floodZone in floodZones.features that the route intersects:
    floodCenter = turf.centroid(floodZone)
    nearestPt = turf.nearestPointOnLine(routeLine, floodCenter)
    bearing = turf.bearing(floodCenter, nearestPt)
    perpBearing = (bearing + 90) % 360
    candidate = turf.destination(floodCenter, 0.3, perpBearing, { units: 'km' })
    if candidate is inside any flood zone:
      candidate = turf.destination(floodCenter, 0.3, (bearing - 90 + 360) % 360, { units: 'km' })
    waypoints.push(candidate.geometry.coordinates)
  return waypoints  // [lon, lat] pairs, inserted between origin and destination
```

Offset distance: **300m** (2× the existing `FLOOD_BUFFER_RADIUS` of 150m).

#### Mapbox API change

`getDirections` gains an optional `waypoints` parameter:
```js
getDirections(origin, destination, alternatives = true, waypoints = [])
```
Coordinates string becomes: `[origin, ...waypoints, destination].map(c => c.join(',')).join(';')`

When waypoints are present, `alternatives` is still requested.

#### Fallback

If the re-fetched route is still flooded (e.g. flood zone spans the only road in the area), the result includes `unavoidable: true`. The UI compact strip shows an amber dot + `"Only available route crosses a flood zone"` instead of the green safe-route label.

#### Retry limit

One retry only. If the bypass waypoint itself is unreachable or Mapbox errors, the original `getSmartRoute` result is returned with `unavoidable: true`.

---

## Files changed

| File | Change |
|------|--------|
| `src/services/routingService.js` | Add `getSmartRouteWithAvoidance`, `computeBypassWaypoints`; extend `getDirections` with optional `waypoints` param |
| `src/App.jsx` | Replace route summary card JSX; replace `getSmartRoute` import/call with `getSmartRouteWithAvoidance`; handle `unavoidable` flag in strip |

No new dependencies. All geometry uses existing `@turf/turf`.

---

## Out of scope

- Multi-zone iterative retry (more than one retry pass).
- Turn-by-turn navigation instructions.
- Road graph / Dijkstra on raw OSM data.
- Changes to `NavigationPanel`, `BottomSheet`, `FloatingActions`, or any Firebase logic.
