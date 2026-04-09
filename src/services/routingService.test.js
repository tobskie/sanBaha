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
    // Note: JS number-to-string drops trailing zeros, so 14.0 → "14"
    expect(url).toContain('121.1,13.9;121.2,14');
    expect(url).not.toContain('undefined');
  });

  it('inserts waypoints between origin and destination in the URL', async () => {
    const { getDirections } = await import('./routingService.js');
    await getDirections([121.1, 13.9], [121.2, 14.0], true, [[121.15, 13.95]]);
    const url = fetchSpy.mock.calls[0][0];
    // Note: JS number-to-string drops trailing zeros, so 14.0 → "14"
    expect(url).toContain('121.1,13.9;121.15,13.95;121.2,14');
  });
});