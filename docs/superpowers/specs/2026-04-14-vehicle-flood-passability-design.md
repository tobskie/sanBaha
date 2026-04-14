# Vehicle Flood Passability — Design Spec

**Date:** 2026-04-14
**Status:** Approved

---

## Overview

Integrate per-vehicle flood passability into sanBaha's existing routing system. Users register their vehicle type in Settings; the routing engine uses the vehicle's ground clearance to compute adjusted flood thresholds, so routes are calculated specifically for their vehicle rather than a fixed one-size-fits-all limit.

---

## Approach

**Tolerance override on existing thresholds (Option A)**

Keep the existing 3-tier flood tier system (`clear / warning / flooded`) but replace the fixed cm breakpoints with vehicle-adjusted ones derived from ground clearance. The routing engine already avoids zones marked `flooded` — it just uses vehicle-specific thresholds instead of global ones. No breaking changes to existing routing logic.

---

## Data Model

### Preset Vehicles (`src/data/vehicles.js`)

Static list shipped with the app. `toleranceLevel` (1–5) is for display only; `groundClearanceCm` drives all passability math.

| id | name | groundClearanceCm | toleranceLevel |
|---|---|---|---|
| `sedan` | Sedan | 15 | 1 |
| `motorcycle` | Motorcycle | 12 | 1 |
| `van` | Van | 18 | 2 |
| `suv` | SUV | 22 | 3 |
| `pickup` | Pickup | 28 | 4 |

### Adjusted Thresholds

Computed at runtime from the vehicle's `groundClearanceCm`:

```
passable  → water depth < groundClearanceCm × 0.6   (60% — safety margin)
warning   → water depth < groundClearanceCm × 1.0   (at clearance limit)
flooded   → water depth ≥ groundClearanceCm × 1.0   (impassable)
```

### User Vehicle Profile (Firebase)

Saved to `/users/{uid}/vehicle`:

```json
{
  "vehicleId": "suv",
  "groundClearanceCm": 22
}
```

`groundClearanceCm` is stored explicitly to allow future user adjustment of preset values.

---

## Architecture

### New: `src/data/vehicles.js`
- `PRESET_VEHICLES` — static array of preset vehicle objects
- `getAdjustedThresholds(vehicle)` — pure function, returns `{ passableMax, warningMax }` in cm
- `getToleranceLabel(toleranceLevel)` — returns display string (e.g. "Low", "Medium", "High")
- No side effects; fully unit-testable

### New: `src/hooks/useVehicleProfile.js`
- Reads `/users/{uid}/vehicle` from Firebase on mount
- Exposes `{ vehicle, setVehicle, loading }`
- `setVehicle(preset)` writes to Firebase and updates local state
- Falls back to `sedan` when: unauthenticated, Firebase read fails, or saved `vehicleId` no longer exists in presets
- On write failure: triggers toast "Couldn't save vehicle — try again"

### Modified: `src/services/routingService.js`
- `createFloodZones(sensors, vehicle?)` — when `vehicle` is provided, uses `getAdjustedThresholds(vehicle)` instead of fixed thresholds from `mockData.js`; omitting `vehicle` preserves current behaviour (backwards compatible)
- `checkRouteIntersection(route, floodZones, vehicle?)` — same optional parameter pattern

### Modified: `src/App.jsx`
- Calls `useVehicleProfile()` at top level
- Passes `vehicle` to all `routingService` calls
- Passes `vehicle` to `NavigationPanel` for display

### Modified: `src/components/NavigationPanel.jsx`
- Displays active vehicle: "Routing for: SUV"
- Shows passability reasoning string on flood zone warnings (see Passability Output below)

### Modified: `src/App.jsx` Settings section (or Settings component)
- Vehicle picker: renders preset list as selectable cards
- Shows name, tolerance level (1–5 stars or bar), and ground clearance in cm
- Saves on tap via `setVehicle`

---

## Passability Output

Reasoning string format shown in NavigationPanel when route intersects a flood zone:

```
✓ SUV can pass: flood 45 cm, vehicle limit 22 cm × 1.0 = 22 cm
✗ Sedan cannot pass: flood 45 cm exceeds vehicle limit 15 cm × 1.0 = 15 cm
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| User not logged in | Falls back to `sedan` (most conservative) |
| Firebase read fails | Falls back to `sedan`, silent — does not block routing |
| Firebase write fails | Toast: "Couldn't save vehicle — try again" |
| `groundClearanceCm` is 0, negative, or NaN | Clamped to preset value before saving |
| Saved `vehicleId` not in presets | Falls back to `sedan` |
| All sensors offline | Existing behaviour unchanged — vehicle profile has no effect |

---

## Testing

### `src/data/vehicles.test.js`
- `getAdjustedThresholds` returns correct cm breakpoints for each preset
- Edge cases: zero clearance, missing fields

### `src/hooks/useVehicleProfile.test.js`
- Falls back to `sedan` when unauthenticated
- Reads saved profile from Firebase mock on mount
- Writes updated profile and calls Firebase setter
- Falls back to `sedan` when saved `vehicleId` is unknown

### `src/services/routingService.test.js` (extend existing)
- `createFloodZones()` with `vehicle=sedan` marks 20 cm sensor as `warning` (above sedan's 60% threshold: 15 × 0.6 = 9 cm)
- `createFloodZones()` with `vehicle=pickup` marks same 20 cm sensor as `passable` (below pickup's 60% threshold: 28 × 0.6 = 16.8 cm)
- Omitting `vehicle` preserves current fixed-threshold behaviour exactly

---

## Extensibility

- Add a new vehicle: append one entry to `PRESET_VEHICLES` in `vehicles.js` — nothing else changes
- Adjust thresholds globally: edit the multipliers (0.6 / 1.0) in `getAdjustedThresholds` — all vehicles update automatically
- Future: allow users to enter a custom ground clearance (the data model already stores `groundClearanceCm` separately from `vehicleId`)
- Future: engine type (petrol vs diesel) can be added as an additional passability factor without restructuring the core logic
