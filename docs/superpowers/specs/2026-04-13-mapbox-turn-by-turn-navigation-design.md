# Mapbox Turn-by-Turn Navigation

**Date:** 2026-04-13
**Status:** Approved

## Overview

Add a real-time turn-by-turn navigation experience to sanBaha using the step data already returned by the Mapbox Directions API. No new SDK or license is required. The UI follows the app's existing dark/glass aesthetic and integrates with the flood-aware routing system already in place.

Features: turn-by-turn banner with expandable step list, lane guidance, automatic off-route re-routing, and offline-capable navigation via service worker tile/route caching.

---

## User Experience

### Collapsed state (default while navigating)
A persistent top banner appears below the mobile header as soon as navigation starts. It shows:
- **Maneuver icon** — SVG arrow matching the next turn type (turn-left, turn-right, straight, u-turn, arrive)
- **Instruction** — e.g. "Turn right" (bold) + "onto Rizal Ave · 200m" (subtext)
- **ETA + distance remaining** — top-right corner, green for on-time
- **Expand chevron** — tap anywhere on the banner to expand the step list

A flood warning pill appears on the map when an upcoming step passes near a flood zone.

### Expanded state (tapped)
The banner stays at the top; below it a scrollable step list slides open (max ~40% screen height) showing all remaining steps:
- Current step is highlighted with a cyan left border
- Each step shows: maneuver icon, instruction, distance from current position
- Steps with a flood zone nearby show an amber ⚠ label
- The "arrive" step uses a green dot icon
- Tap the banner again (chevron now points up) to collapse

### Lane guidance
When the current step's next intersection has lane data (`intersections[n].lanes`), a lane diagram appears inside the banner between the maneuver icon and instruction. Each lane is drawn as a small arrow pill — valid lanes for the current maneuver are highlighted cyan, invalid lanes are dimmed. Only shown when ≥2 lanes are present. Disappears when the intersection is passed.

### Off-route detection & automatic re-routing
If the user's GPS position drifts more than **50 m** from the current route geometry for more than **5 seconds**, the banner switches to a "Re-routing…" state (spinner, amber colour). `getSmartRouteWithAvoidance` is called with the current user position as origin and the original destination. On success the route and step list update silently; on failure the banner shows "Route unavailable" and offers a "Retry" button.

### End navigation
An "End" button sits in the bottom strip of the banner at all times. Tapping it clears the route, exits follow mode, and dismisses the banner.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/hooks/useNavigationStep.js` | Tracks current step index, distance to next maneuver, remaining distance/duration, off-route detection |
| `src/components/NavigationBanner.jsx` | Top banner UI — collapsed + expanded states, lane diagram, re-routing indicator |
| `src/utils/maneuverIcons.jsx` | Returns the correct SVG arrow for a Mapbox maneuver type/modifier |
| `src/utils/laneGuidance.jsx` | Renders the lane diagram from Mapbox intersection lane data |
| `public/sw.js` | Service worker — caches map tiles and route JSON for offline use |

### Modified files

| File | Change |
|------|--------|
| `src/App.jsx` | Mount `NavigationBanner`; pass step state and re-route callback from hook |
| `src/components/FloodMap.jsx` | Pass flood warning context to step list |
| `src/main.jsx` | Register service worker on mount |

---

## `useNavigationStep` hook

**Inputs:** `routeData` (Mapbox route object with `.legs[0].steps`), `userLocation` ([lng, lat]), `floodZones`

**Inputs:** `routeData`, `userLocation` ([lng, lat]), `floodZones`, `onReroute` (callback receiving new origin)

**Outputs:**
```js
{
  currentStepIndex,      // index into steps array
  currentStep,           // step object
  distanceToManeuver,    // metres to next maneuver point
  remainingDistance,     // metres to destination
  remainingDuration,     // seconds to destination
  stepsWithFloodWarning, // Set of step indices that pass near a flood zone
  currentLanes,          // lane array from current step's next intersection (or null)
  isOffRoute,            // true while rerouting is in progress
}
```

**Step advancement logic:**
- Each Mapbox step has a `maneuver.location` [lng, lat]
- Use `turf.distance(userLocation, nextManeuver.location)` each time `userLocation` updates
- When distance drops below **30 m**, advance `currentStepIndex` by 1
- On the final step (arrive), mark navigation as complete

**Off-route detection:**
- On each GPS update, compute `turf.nearestPointOnLine(routeGeometry, userLocation)` to get the snapped distance
- If snapped distance > **50 m** for **5 consecutive seconds**, set `isOffRoute = true` and call `onReroute(userLocation)`
- Reset the 5-second counter whenever the user is back within 50 m
- While `isOffRoute` is true, step advancement is paused

**Lane guidance:**
- Each Mapbox step contains `intersections[]`; the first intersection ahead of the user that has a `lanes` array is used
- `currentLanes` is set to that `lanes` array (each element has `valid: bool`, `indications: string[]`)
- Updated whenever `currentStepIndex` changes

**Flood annotation:**
- For each step's geometry, check `turf.booleanIntersects` against `floodZones`
- Annotate matching step indices into `stepsWithFloodWarning`
- Runs once when `routeData` or `floodZones` changes (not on every GPS update)

---

## `NavigationBanner` component

**Props:** `currentStep`, `steps`, `distanceToManeuver`, `remainingDistance`, `remainingDuration`, `destination`, `stepsWithFloodWarning`, `currentLanes`, `isOffRoute`, `onEnd`

**Behaviour:**
- Renders `null` when no `currentStep` (not navigating)
- Positioned `absolute top-[56px]` (below the mobile header), full width, `z-[1001]`
- `isExpanded` local state toggled by tapping the banner
- Step list uses `overflow-y-auto max-h-[40vh]`
- Flood warning pill on the map is rendered by the banner's parent (`App.jsx`) as a separate overlay, driven by `stepsWithFloodWarning`
- When `isOffRoute` is true, banner body is replaced with a "Re-routing…" amber state (spinner + message); step list is hidden
- When `currentLanes` is non-null and has ≥ 2 elements, renders `<LaneGuidance lanes={currentLanes} />` between the maneuver icon and instruction text

---

## Maneuver Icons (`maneuverIcons.jsx`)

Maps Mapbox `maneuver.type` + `maneuver.modifier` to SVG icons:

| Type / modifier | Icon |
|----------------|------|
| `turn` + `left` | ← arrow |
| `turn` + `right` | → arrow |
| `turn` + `slight left` | ↖ arrow |
| `turn` + `slight right` | ↗ arrow |
| `turn` + `sharp left/right` | sharp bend arrow |
| `continue` / `merge` / `new name` | ↑ straight arrow |
| `roundabout` | circular arrow |
| `uturn` | U-turn arrow |
| `depart` | start dot |
| `arrive` | destination pin |

All icons are inline SVGs using the `#00d4ff` (cyan) accent color for the current step, `#64748b` (slate) for upcoming steps.

---

## `laneGuidance.jsx`

Renders a horizontal row of lane arrow pills from a Mapbox `lanes` array.

- Each lane is a narrow rounded rectangle (~24×36 px)
- Contains a small arrow SVG matching `lane.indications[0]` (straight, left, right, slight-left, etc.)
- Valid lanes (`lane.valid === true`) are filled `#00d4ff`, opacity 1
- Invalid lanes are filled `#1e3a5f`, opacity 0.4
- Rendered inside the banner, between the maneuver icon block and the instruction text
- Hidden when `lanes` is null or has fewer than 2 elements

---

## Automatic re-routing

Handled in `App.jsx` via the `onReroute` callback passed to `useNavigationStep`:

```js
const handleReroute = async (newOrigin) => {
  setIsRerouting(true);
  const result = await getSmartRouteWithAvoidance(newOrigin, destination, hotspots);
  if (result.success) {
    setRouteData(result);   // hook resets step index on routeData change
  } else {
    setRouteError('Route unavailable');
  }
  setIsRerouting(false);
};
```

- `isRerouting` state in `App.jsx` is passed as `isOffRoute` to `NavigationBanner`
- Debounced: will not fire again within 15 seconds of the last re-route attempt
- Original destination is preserved across re-routes

---

## Offline navigation (service worker)

### Strategy
When the user starts navigation, the app pre-caches everything needed to navigate without internet:

1. **Route data** — the full Directions API response is stored in `IndexedDB` under key `active-route`
2. **Map tiles** — the service worker intercepts Mapbox tile requests (`api.mapbox.com/v4/**`) and caches them using a **Cache-first** strategy during navigation, falling back to network
3. **App shell** — already handled by Vite's default service worker (if present); `sw.js` supplements it

### `public/sw.js`
- Registered in `src/main.jsx` on app load
- Listens for `message` events from the main thread:
  - `{ type: 'START_NAV', bbox }` — triggers pre-fetching tiles for the route bounding box at zoom 12–16
  - `{ type: 'END_NAV' }` — clears the tile cache to free storage
- Intercepts `api.mapbox.com/v4/**` fetch requests: serves from cache if available, falls back to network and caches the response
- Does **not** intercept Directions API calls (those require live data for re-routing)

### Offline indicator
When the browser is offline (`navigator.onLine === false`), a small "Offline" pill appears in the GPS status bar. Navigation continues from cached tiles and the last-fetched route.

### Registration in `src/main.jsx`
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## Integration with existing systems

### Flood-aware routing
No change to routing logic. `useNavigationStep` reads the already-computed `floodZones` from `App.jsx` state to annotate steps. The flood warning shown in the step list is purely informational — the route has already been calculated to avoid flooded roads.

### Follow mode
`NavigationBanner` mounts only when `routeData` is set. Follow mode (`isFollowMode`) continues to be managed by `App.jsx` — the banner does not touch it. The "End" button calls `onEnd` which clears `routeData` and sets `isFollowMode = false`.

### Bottom sheet / other panels
The banner is `z-[1001]`, below the navigation panel (`z-[1002]`) and above the map. It does not conflict with the bottom sheet since it anchors to the top of the screen.

### `bottomOffset` prop (FloodMap)
The existing GPS status pill and re-center button use `bottomOffset` to avoid being hidden by the bottom sheet. The banner adds space at the top, not the bottom — no change to `bottomOffset` logic needed.

---

## Error handling

- If `userLocation` is null, step advancement is paused (banner shows last known step)
- If `routeData.legs[0].steps` is missing or empty, banner renders null
- Arrival detection: when `currentStepIndex >= steps.length - 1` AND `distanceToManeuver < 30m`, show "You have arrived" state in the banner for 3 seconds, then call `onEnd`

---

## Out of scope

- Voice guidance
- Offline map downloads (user-initiated tile packs)
- Speed limit display
- Traffic incident overlays
