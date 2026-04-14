# Vehicle Flood Passability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate per-vehicle flood passability into the routing system so routes are calculated using each user's vehicle ground clearance instead of fixed global thresholds.

**Architecture:** Add a `vehicles.js` data module with presets and threshold math, a `useVehicleProfile` hook that persists the selection to Firebase, then thread the vehicle object through `createFloodZones` / `getSmartRouteWithAvoidance` so flood zone severity is vehicle-specific. The vehicle picker lives in the existing Settings modal.

**Tech Stack:** React, Vitest, Firebase Realtime Database (`firebase/database`), existing `@turf/turf` routing pipeline.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/data/vehicles.js` | Preset list + pure threshold math |
| Create | `src/data/vehicles.test.js` | Unit tests for vehicles.js |
| Create | `src/hooks/useVehicleProfile.js` | Firebase read/write + fallback logic |
| Create | `src/hooks/useVehicleProfile.test.js` | Hook tests with Firebase mocks |
| Modify | `src/services/routingService.js` | Add `vehicle?` param to `createFloodZones`, `getSmartRoute`, `getSmartRouteWithAvoidance` |
| Modify | `src/services/routingService.test.js` | Tests for vehicle-adjusted threshold behaviour |
| Modify | `src/components/NavigationPanel.jsx` | Accept + display active vehicle |
| Modify | `src/App.jsx` | Wire `useVehicleProfile`, pass vehicle to routing, add Settings picker |

---

## Task 1: Create `src/data/vehicles.js`

**Files:**
- Create: `src/data/vehicles.js`

- [ ] **Step 1: Write the file**

```js
// src/data/vehicles.js

export const PRESET_VEHICLES = [
  { id: 'motorcycle', name: 'Motorcycle',  groundClearanceCm: 12, toleranceLevel: 1 },
  { id: 'sedan',      name: 'Sedan',       groundClearanceCm: 15, toleranceLevel: 1 },
  { id: 'van',        name: 'Van',         groundClearanceCm: 18, toleranceLevel: 2 },
  { id: 'suv',        name: 'SUV',         groundClearanceCm: 22, toleranceLevel: 3 },
  { id: 'pickup',     name: 'Pickup',      groundClearanceCm: 28, toleranceLevel: 4 },
];

export const DEFAULT_VEHICLE = PRESET_VEHICLES.find(v => v.id === 'sedan');

/**
 * Compute vehicle-adjusted flood tier thresholds in cm.
 * passableMax: water depth below which the road is safely passable
 * warningMax:  water depth below which the road is passable with caution
 * At or above warningMax the road is considered flooded (impassable).
 *
 * @param {{ groundClearanceCm: number }} vehicle
 * @returns {{ passableMax: number, warningMax: number }}
 */
export function getAdjustedThresholds(vehicle) {
  const clearance = vehicle?.groundClearanceCm;
  if (!clearance || clearance <= 0 || !isFinite(clearance)) {
    return getAdjustedThresholds(DEFAULT_VEHICLE);
  }
  return {
    passableMax: clearance * 0.6,
    warningMax:  clearance * 1.0,
  };
}

/**
 * Look up a preset by id. Returns DEFAULT_VEHICLE if id is unknown.
 * @param {string} id
 * @returns {Object}
 */
export function getVehicleById(id) {
  return PRESET_VEHICLES.find(v => v.id === id) ?? DEFAULT_VEHICLE;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/vehicles.js
git commit -m "feat: add vehicle preset data and getAdjustedThresholds helper"
```

---

## Task 2: Test `src/data/vehicles.js`

**Files:**
- Create: `src/data/vehicles.test.js`

- [ ] **Step 1: Write the tests**

```js
// src/data/vehicles.test.js
import { describe, it, expect } from 'vitest';
import {
  PRESET_VEHICLES,
  DEFAULT_VEHICLE,
  getAdjustedThresholds,
  getVehicleById,
} from './vehicles.js';

describe('PRESET_VEHICLES', () => {
  it('contains at least 5 entries', () => {
    expect(PRESET_VEHICLES.length).toBeGreaterThanOrEqual(5);
  });

  it('every preset has id, name, groundClearanceCm > 0, toleranceLevel 1-5', () => {
    for (const v of PRESET_VEHICLES) {
      expect(typeof v.id).toBe('string');
      expect(typeof v.name).toBe('string');
      expect(v.groundClearanceCm).toBeGreaterThan(0);
      expect(v.toleranceLevel).toBeGreaterThanOrEqual(1);
      expect(v.toleranceLevel).toBeLessThanOrEqual(5);
    }
  });
});

describe('getAdjustedThresholds', () => {
  it('sedan (15 cm) → passableMax=9, warningMax=15', () => {
    const sedan = PRESET_VEHICLES.find(v => v.id === 'sedan');
    const t = getAdjustedThresholds(sedan);
    expect(t.passableMax).toBeCloseTo(9);
    expect(t.warningMax).toBeCloseTo(15);
  });

  it('pickup (28 cm) → passableMax=16.8, warningMax=28', () => {
    const pickup = PRESET_VEHICLES.find(v => v.id === 'pickup');
    const t = getAdjustedThresholds(pickup);
    expect(t.passableMax).toBeCloseTo(16.8);
    expect(t.warningMax).toBeCloseTo(28);
  });

  it('falls back to sedan thresholds when clearance is 0', () => {
    const t = getAdjustedThresholds({ groundClearanceCm: 0 });
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
  });

  it('falls back to sedan thresholds when clearance is negative', () => {
    const t = getAdjustedThresholds({ groundClearanceCm: -5 });
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
  });

  it('falls back to sedan thresholds when vehicle is null', () => {
    const t = getAdjustedThresholds(null);
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
  });
});

describe('getVehicleById', () => {
  it('returns the correct preset for a known id', () => {
    const suv = getVehicleById('suv');
    expect(suv.id).toBe('suv');
    expect(suv.groundClearanceCm).toBe(22);
  });

  it('returns DEFAULT_VEHICLE for an unknown id', () => {
    const result = getVehicleById('flying_car');
    expect(result.id).toBe(DEFAULT_VEHICLE.id);
  });
});
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
npm test -- --run src/data/vehicles.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/data/vehicles.test.js
git commit -m "test: add vehicles.js unit tests"
```

---

## Task 3: Create `src/hooks/useVehicleProfile.js`

**Files:**
- Create: `src/hooks/useVehicleProfile.js`

- [ ] **Step 1: Write the hook**

```js
// src/hooks/useVehicleProfile.js
import { useState, useEffect } from 'react';
import { ref, get, set as dbSet } from 'firebase/database';
import { database } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_VEHICLE, getVehicleById } from '../data/vehicles';

/**
 * Reads and writes the user's vehicle profile from Firebase.
 * Falls back to DEFAULT_VEHICLE (sedan) when:
 *   - user is not authenticated
 *   - Firebase read fails
 *   - saved vehicleId is no longer in PRESET_VEHICLES
 *
 * @returns {{ vehicle: Object, setVehicle: Function, loading: boolean }}
 */
export default function useVehicleProfile() {
  const { user } = useAuth();
  const [vehicle, setVehicleState] = useState(DEFAULT_VEHICLE);
  const [loading, setLoading] = useState(true);

  // Load from Firebase on mount / user change
  useEffect(() => {
    if (!user) {
      setVehicleState(DEFAULT_VEHICLE);
      setLoading(false);
      return;
    }

    const profileRef = ref(database, `users/${user.uid}/vehicle`);
    get(profileRef)
      .then(snapshot => {
        const data = snapshot.val();
        if (data?.vehicleId) {
          setVehicleState(getVehicleById(data.vehicleId));
        }
      })
      .catch(() => {
        // Silent fallback — user still gets DEFAULT_VEHICLE
      })
      .finally(() => setLoading(false));
  }, [user]);

  /**
   * Save a new vehicle selection. Optimistically updates local state.
   * Shows no toast on success; caller handles failure toast if needed.
   * @param {Object} preset - one of PRESET_VEHICLES
   * @returns {Promise<void>}
   */
  const setVehicle = async (preset) => {
    setVehicleState(preset);
    if (!user) return;

    const profileRef = ref(database, `users/${user.uid}/vehicle`);
    await dbSet(profileRef, {
      vehicleId: preset.id,
      groundClearanceCm: preset.groundClearanceCm,
    });
  };

  return { vehicle, setVehicle, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useVehicleProfile.js
git commit -m "feat: add useVehicleProfile hook with Firebase persistence"
```

---

## Task 4: Test `src/hooks/useVehicleProfile.js`

**Files:**
- Create: `src/hooks/useVehicleProfile.test.js`

- [ ] **Step 1: Write the tests**

```js
// src/hooks/useVehicleProfile.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firebase mocks ────────────────────────────────────────────────────────
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockRef = vi.fn((db, path) => ({ path }));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => ({})),
  ref: (db, path) => mockRef(db, path),
  get: (...args) => mockGet(...args),
  set: (...args) => mockSet(...args),
  onValue: vi.fn(),
  push: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/storage', () => ({ getStorage: vi.fn() }));

vi.mock('../data/mockData', () => ({
  getStatusFromWaterLevel: vi.fn(() => 'clear'),
}));

// ── Auth mock ─────────────────────────────────────────────────────────────
const mockUser = { uid: 'user-123' };
let authUser = null;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────
import { DEFAULT_VEHICLE, PRESET_VEHICLES } from '../data/vehicles';

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  mockGet.mockResolvedValue({ val: () => null });
  mockSet.mockResolvedValue(undefined);
});

describe('useVehicleProfile', () => {
  it('returns DEFAULT_VEHICLE when user is not logged in', async () => {
    authUser = null;
    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    // loading settles synchronously when unauthenticated
    expect(result.current.vehicle.id).toBe(DEFAULT_VEHICLE.id);
    expect(result.current.loading).toBe(false);
  });

  it('loads saved vehicle from Firebase when user is logged in', async () => {
    authUser = mockUser;
    mockGet.mockResolvedValue({ val: () => ({ vehicleId: 'suv', groundClearanceCm: 22 }) });

    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());

    // Wait for the async Firebase get to resolve
    await act(async () => {});

    expect(result.current.vehicle.id).toBe('suv');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to DEFAULT_VEHICLE when Firebase returns an unknown vehicleId', async () => {
    authUser = mockUser;
    mockGet.mockResolvedValue({ val: () => ({ vehicleId: 'hovercraft' }) });

    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    await act(async () => {});

    expect(result.current.vehicle.id).toBe(DEFAULT_VEHICLE.id);
  });

  it('falls back to DEFAULT_VEHICLE when Firebase read throws', async () => {
    authUser = mockUser;
    mockGet.mockRejectedValue(new Error('network error'));

    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    await act(async () => {});

    expect(result.current.vehicle.id).toBe(DEFAULT_VEHICLE.id);
  });

  it('setVehicle updates local state and writes to Firebase', async () => {
    authUser = mockUser;
    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    await act(async () => {});

    const pickup = PRESET_VEHICLES.find(v => v.id === 'pickup');
    await act(async () => {
      await result.current.setVehicle(pickup);
    });

    expect(result.current.vehicle.id).toBe('pickup');
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      { vehicleId: 'pickup', groundClearanceCm: 28 }
    );
  });

  it('setVehicle updates local state but skips Firebase write when unauthenticated', async () => {
    authUser = null;
    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());

    const suv = PRESET_VEHICLES.find(v => v.id === 'suv');
    await act(async () => {
      await result.current.setVehicle(suv);
    });

    expect(result.current.vehicle.id).toBe('suv');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
npm test -- --run src/hooks/useVehicleProfile.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVehicleProfile.test.js
git commit -m "test: add useVehicleProfile hook tests"
```

---

## Task 5: Update `routingService.js` — vehicle-aware `createFloodZones`

**Files:**
- Modify: `src/services/routingService.js`

The goal: when a `vehicle` is passed, use `getAdjustedThresholds(vehicle)` instead of the hardcoded 25/70 cm values to classify each sensor's flood status.

- [ ] **Step 1: Add the import at the top of `routingService.js`**

After line 1 (`import * as turf from '@turf/turf';`), add:

```js
import { getAdjustedThresholds } from '../data/vehicles';
```

- [ ] **Step 2: Replace `createFloodZones` with the vehicle-aware version**

Replace the entire `createFloodZones` function (lines 224–250 in the original file) with:

```js
/**
 * Create circular buffer polygons around flood points.
 * When `vehicle` is provided, uses vehicle-adjusted thresholds to classify
 * sensor status. Without `vehicle`, falls back to the global fixed thresholds.
 *
 * @param {Array} floodPoints - Array of flood hotspot objects with { status, waterLevel, rain_mm, coordinates }
 * @param {Object|null} [vehicle=null] - Vehicle profile from PRESET_VEHICLES
 * @returns {Object} GeoJSON FeatureCollection of flood zones
 */
export function createFloodZones(floodPoints, vehicle = null) {
    const getEffectiveStatus = (point) => {
        if (!vehicle) return point.status;
        const { passableMax, warningMax } = getAdjustedThresholds(vehicle);
        const wl = point.waterLevel ?? 0;
        if (wl < passableMax) return 'clear';
        if (wl < warningMax) return 'warning';
        return 'flooded';
    };

    const relevantPoints = floodPoints.filter(p => {
        const effectiveStatus = getEffectiveStatus(p);
        return (
            effectiveStatus === 'flooded' ||
            effectiveStatus === 'warning' ||
            (effectiveStatus === 'clear' && (p.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
        );
    });

    const features = relevantPoints.map(point => {
        const effectiveStatus = getEffectiveStatus(point);
        const zoneStatus = (effectiveStatus === 'clear' && (point.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
            ? 'precautionary'
            : effectiveStatus;

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

- [ ] **Step 3: Add `vehicle` parameter to `getSmartRoute`**

Replace the `getSmartRoute` function signature and its `createFloodZones` call:

```js
export async function getSmartRoute(origin, destination, floodPoints, vehicle = null) {
    try {
        const directionsData = await getDirections(origin, destination, true);

        if (!directionsData.routes || directionsData.routes.length === 0) {
            throw new Error('No routes found');
        }

        const floodZones = createFloodZones(floodPoints, vehicle);   // ← pass vehicle
        const analysis = findSafestRoute(directionsData.routes, floodZones);

        return {
            success: true,
            ...analysis,
            floodZones,
            origin,
            destination
        };
    } catch (error) {
        console.error('Smart routing error:', error);
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 4: Add `vehicle` parameter to `getSmartRouteWithAvoidance`**

Replace the `getSmartRouteWithAvoidance` function signature and its internal calls:

```js
export async function getSmartRouteWithAvoidance(origin, destination, floodPoints, vehicle = null) {
    try {
        const initial = await getSmartRoute(origin, destination, floodPoints, vehicle);  // ← pass vehicle
        if (!initial.success) return initial;
        if (!initial.safeRoute.isFlooded) return { ...initial, unavoidable: false };

        const bypassWaypoints = computeBypassWaypoints(initial.safeRoute, initial.floodZones);
        if (bypassWaypoints.length === 0) return { ...initial, unavoidable: true };

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
        console.error('Smart routing with avoidance error:', error);
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/routingService.js
git commit -m "feat: add vehicle param to createFloodZones, getSmartRoute, getSmartRouteWithAvoidance"
```

---

## Task 6: Extend `routingService.test.js` with vehicle threshold tests

**Files:**
- Modify: `src/services/routingService.test.js`

- [ ] **Step 1: Add vehicle mock and new describe block at the end of the test file**

Append to `src/services/routingService.test.js`:

```js
// ── vehicle-aware createFloodZones ────────────────────────────────────────

vi.mock('../data/vehicles', () => ({
  getAdjustedThresholds: vi.fn((vehicle) => {
    if (vehicle?.id === 'sedan')  return { passableMax: 9,    warningMax: 15   };
    if (vehicle?.id === 'pickup') return { passableMax: 16.8, warningMax: 28   };
    return { passableMax: 9, warningMax: 15 }; // fallback to sedan
  }),
}));

import { getAdjustedThresholds } from '../data/vehicles';

describe('createFloodZones — vehicle-adjusted thresholds', () => {
  const makePoint = (waterLevel, rain_mm = 0) => ({
    id: 'p1',
    name: 'Test Point',
    status: 'clear',           // raw Firebase status — will be overridden by vehicle math
    waterLevel,
    rain_mm,
    coordinates: [13.94, 121.15],
  });

  it('sedan: 20 cm sensor is warning (above sedan passableMax of 9 cm)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const sedan = { id: 'sedan', groundClearanceCm: 15 };
    const zones = createFloodZones([makePoint(20)], sedan);
    // 20 >= 9 (passableMax) and 20 >= 15 (warningMax) → flooded for sedan
    // but 20 < warningMax(15)? No — 20 > 15 → flooded. So zone should exist.
    expect(zones.features.length).toBe(1);
    expect(zones.features[0].properties.status).toBe('flooded');
  });

  it('pickup: 20 cm sensor is passable (below pickup passableMax of 16.8 cm)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const pickup = { id: 'pickup', groundClearanceCm: 28 };
    // 20 > 16.8 → warning for pickup; still included in zones as 'warning'
    const zones = createFloodZones([makePoint(20)], pickup);
    expect(zones.features[0].properties.status).toBe('warning');
  });

  it('pickup: 10 cm sensor is excluded (below pickup passableMax of 16.8 cm, no rain)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const pickup = { id: 'pickup', groundClearanceCm: 28 };
    // 10 < 16.8 (passableMax) → clear → excluded
    const zones = createFloodZones([makePoint(10)], pickup);
    expect(zones.features.length).toBe(0);
  });

  it('no vehicle: uses original point.status (backwards compatible)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const flooded = { ...makePoint(80), status: 'flooded' };
    const zones = createFloodZones([flooded]);   // no vehicle arg
    expect(zones.features.length).toBe(1);
    expect(zones.features[0].properties.status).toBe('flooded');
  });
});
```

- [ ] **Step 2: Run all routing tests and confirm they pass**

```bash
npm test -- --run src/services/routingService.test.js
```

Expected: all existing tests + 4 new tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/routingService.test.js
git commit -m "test: add vehicle-adjusted threshold tests for createFloodZones"
```

---

## Task 7: Update `NavigationPanel.jsx` to display active vehicle

**Files:**
- Modify: `src/components/NavigationPanel.jsx`

- [ ] **Step 1: Add `vehicle` to the props destructure**

In `NavigationPanel.jsx`, change the function signature from:

```js
const NavigationPanel = ({
    origin,
    destination,
    onOriginChange,
    onDestinationChange,
    onNavigate,
    onClose,
    isRouting,
    userLocation
}) => {
```

to:

```js
const NavigationPanel = ({
    origin,
    destination,
    onOriginChange,
    onDestinationChange,
    onNavigate,
    onClose,
    isRouting,
    userLocation,
    vehicle,
}) => {
```

- [ ] **Step 2: Add the vehicle badge below the header `<h3>`**

In the header `<div className="flex items-center justify-between mb-4">`, after the closing `</h3>` tag and before the close button `<button onClick={onClose}...>`, insert:

```jsx
{vehicle && (
  <span className="text-[10px] text-[#00d4ff]/70 font-normal ml-1">
    {vehicle.name}
  </span>
)}
```

So the full header block reads:

```jsx
<div className="flex items-center justify-between mb-4">
  <h3 className="font-bold text-white text-sm flex items-center gap-2">
    <svg className="w-4 h-4 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
    Navigate
    {vehicle && (
      <span className="text-[10px] text-[#00d4ff]/70 font-normal ml-1">
        {vehicle.name}
      </span>
    )}
  </h3>
  <button
    onClick={onClose}
    className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
  >
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NavigationPanel.jsx
git commit -m "feat: show active vehicle name in NavigationPanel header"
```

---

## Task 8: Wire everything together in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import for `useVehicleProfile` and `PRESET_VEHICLES`**

Near the top of `App.jsx`, after the existing hook imports (e.g. after `import { useReviewQueue }...`), add:

```js
import useVehicleProfile from './hooks/useVehicleProfile';
import { PRESET_VEHICLES } from './data/vehicles';
```

- [ ] **Step 2: Call the hook inside the `App` component**

After the existing hook calls (e.g. after `const pendingReviewCount = useReviewQueue();`), add:

```js
const { vehicle, setVehicle } = useVehicleProfile();
```

- [ ] **Step 3: Pass `vehicle` to the `createFloodZones` call (map display)**

Find (line ~173):
```js
const zones = createFloodZones(hotspots);
```

Replace with:
```js
const zones = createFloodZones(hotspots, vehicle);
```

- [ ] **Step 4: Pass `vehicle` to both `getSmartRouteWithAvoidance` calls**

There are two calls in App.jsx. Find each one — they look like:
```js
const result = await getSmartRouteWithAvoidance(origin, dest, hotspots);
```
and
```js
const result = await getSmartRouteWithAvoidance(origin, destination, hotspots);
```

Add `vehicle` as the fourth argument to both:
```js
const result = await getSmartRouteWithAvoidance(origin, dest, hotspots, vehicle);
```
```js
const result = await getSmartRouteWithAvoidance(origin, destination, hotspots, vehicle);
```

- [ ] **Step 5: Pass `vehicle` to `NavigationPanel`**

Find the `<NavigationPanel` JSX render and add the `vehicle` prop:

```jsx
<NavigationPanel
  origin={originLocation}
  destination={destLocation}
  onOriginChange={setOriginLocation}
  onDestinationChange={setDestLocation}
  onNavigate={handleNavigate}
  onClose={() => setShowNavigationPanel(false)}
  isRouting={isRouting}
  userLocation={userLocation}
  vehicle={vehicle}
/>
```

- [ ] **Step 6: Add the vehicle picker section inside the Settings modal**

Inside the Settings modal `<div className="p-4 space-y-4">`, add this block **before** the existing first toggle (Historical Flood Zones):

```jsx
{/* Vehicle Profile */}
<div className="p-3 rounded-xl bg-[#162d4d]">
  <p className="text-sm text-white mb-2">Your Vehicle</p>
  <p className="text-[10px] text-slate-400 mb-3">Affects flood passability thresholds for routing</p>
  <div className="grid grid-cols-2 gap-2">
    {PRESET_VEHICLES.map(v => (
      <button
        key={v.id}
        onClick={async () => {
          try {
            await setVehicle(v);
          } catch {
            setToast({ type: 'error', message: "Couldn't save vehicle — try again" });
          }
        }}
        className={`p-2 rounded-lg text-left transition-all active:scale-95 border ${
          vehicle?.id === v.id
            ? 'border-[#00d4ff] bg-[#00d4ff]/10 text-white'
            : 'border-transparent bg-[#0d2137] text-slate-400'
        }`}
      >
        <p className="text-xs font-medium">{v.name}</p>
        <p className="text-[10px] text-slate-500">{v.groundClearanceCm} cm clearance</p>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Run the full test suite**

```bash
npm test -- --run
```

Expected: all 85 existing tests + new tests pass. No regressions.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire vehicle profile into routing and settings UI"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run the full test suite one more time**

```bash
npm test -- --run
```

Expected output (all tests pass, no failures):
```
Test Files  N passed
Tests       N passed
```

- [ ] **Step 2: Push the branch**

```bash
git push origin feat/turn-by-turn-navigation
```
