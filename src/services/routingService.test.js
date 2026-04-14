import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @turf/turf — real geometry tested in integration, unit tests use stubs
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

let fetchSpy;

beforeEach(() => {
  vi.clearAllMocks();
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
    await getDirections([121.1, 13.9], [121.2, 14.1]);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('121.1,13.9;121.2,14.1');
    expect(url).not.toContain('undefined');
  });

  it('inserts waypoints between origin and destination in the URL', async () => {
    const { getDirections } = await import('./routingService.js');
    await getDirections([121.1, 13.9], [121.2, 14.1], true, [[121.15, 13.95]]);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('121.1,13.9;121.15,13.95;121.2,14.1');
  });
});

import * as turf from '@turf/turf';

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
    turf.booleanPointInPolygon
      .mockReturnValueOnce(true)   // entry: right side blocked
      .mockReturnValueOnce(true);  // exit: right side blocked

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
    // destination called 4 times: right entry, right exit (initial), left entry, left exit (flipped)
    expect(destSpy).toHaveBeenCalledTimes(4);
  });
});

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
    turf.booleanIntersects.mockReturnValueOnce(true);
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
    turf.booleanIntersects.mockReturnValueOnce(true);
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

describe('getSmartRouteWithAvoidance', () => {
  it('returns immediately when initial route is dry', async () => {
    // booleanIntersects stays false (default mock) → no flood
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { type: 'LineString', coordinates: [[121.1, 13.9],[121.2,14.1]] }, duration: 600, distance: 5000 }]
      })
    });
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.1], []);
    expect(result.success).toBe(true);
    expect(result.safeRoute.isFlooded).toBe(false);
    // Only one fetch call — no retry
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries with bypass waypoints when initial route is flooded', async () => {
    turf.booleanIntersects.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true); // all routes flooded
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { type: 'LineString', coordinates: [[121.1, 13.9],[121.2,14.1]] }, duration: 600, distance: 5000 }]
      })
    });
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const floodPoints = [{ id: '1', name: 'Quiib', status: 'flooded', coordinates: [13.95, 121.15], waterLevel: 1.2 }];
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.1], floodPoints);
    expect(result.success).toBe(true);
    // Two fetches: initial + retry
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.unavoidable).toBe(true); // still flooded after retry
  });

  it('returns success:false when Mapbox fetch throws', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.1], []);
    expect(result.success).toBe(false);
    expect(result.error).toBe('network error');
  });

  it('returns unavoidable:false when retry finds a dry route', async () => {
    // Reset persistent mockReturnValue from previous tests so the default falls through to false
    turf.booleanIntersects.mockReset();
    // Call #1: checkRouteIntersection (initial fetch) → flooded
    // Call #2: computeBypassWaypoints → zone intersects route → waypoint generated
    // Call #3+: checkRouteIntersection (retry fetch) → dry (default returns undefined/falsy)
    turf.booleanIntersects.mockReturnValueOnce(true).mockReturnValueOnce(true);
    // Subsequent calls (inside findSafestRoute on retry fetch): dry (default mock returns false)
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { type: 'LineString', coordinates: [[121.1, 13.9],[121.2,14.1]] }, duration: 600, distance: 5000 }]
      })
    });
    const { getSmartRouteWithAvoidance } = await import('./routingService.js');
    const floodPoints = [{ id: '1', name: 'Quiib', status: 'flooded', coordinates: [13.95, 121.15], waterLevel: 1.2 }];
    const result = await getSmartRouteWithAvoidance([121.1, 13.9], [121.2, 14.1], floodPoints);
    expect(result.success).toBe(true);
    expect(result.unavoidable).toBe(false);
    expect(result.safeRoute.isFlooded).toBe(false);
    // Two fetches: initial + retry
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

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

  it('sedan: 20 cm sensor is flooded (above sedan warningMax of 15 cm)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const sedan = { id: 'sedan', groundClearanceCm: 15 };
    const zones = createFloodZones([makePoint(20)], sedan);
    expect(zones.features.length).toBe(1);
    expect(zones.features[0].properties.status).toBe('flooded');
  });

  it('pickup: 20 cm sensor is warning (above pickup passableMax 16.8, below warningMax 28)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const pickup = { id: 'pickup', groundClearanceCm: 28 };
    const zones = createFloodZones([makePoint(20)], pickup);
    expect(zones.features[0].properties.status).toBe('warning');
  });

  it('pickup: 10 cm sensor is excluded (below pickup passableMax of 16.8 cm, no rain)', async () => {
    const { createFloodZones } = await import('./routingService.js');
    const pickup = { id: 'pickup', groundClearanceCm: 28 };
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
