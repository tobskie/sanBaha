import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useNavigationStep from './useNavigationStep';

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
    act(() => {
      rerender({ loc: [121.15199, 13.940] });
    });
    expect(result.current.currentStepIndex).toBe(1);
  });

  it('does not advance before within 30m', () => {
    const { result, rerender } = renderHook(
      ({ loc }) => useNavigationStep(routeData, loc, floodZones, vi.fn()),
      { initialProps: { loc: [121.150, 13.940] } }
    );
    act(() => {
      rerender({ loc: [121.1505, 13.940] });
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

  it('returns steps array', () => {
    const { result } = renderHook(() =>
      useNavigationStep(routeData, [121.150, 13.940], floodZones, vi.fn())
    );
    expect(result.current.steps).toHaveLength(3);
  });

  it('returns remainingDistance and remainingDuration as numbers', () => {
    const { result } = renderHook(() =>
      useNavigationStep(routeData, [121.150, 13.940], floodZones, vi.fn())
    );
    expect(result.current.remainingDistance).toBeGreaterThan(0);
    expect(result.current.remainingDuration).toBeGreaterThan(0);
  });

  it('returns currentLanes null when step has no lane data', () => {
    const { result } = renderHook(() =>
      useNavigationStep(routeData, [121.150, 13.940], floodZones, vi.fn())
    );
    expect(result.current.currentLanes).toBeNull();
  });

  it('returns currentLanes array when step intersection has 2+ lanes', () => {
    const lanes = [{ valid: true, indications: ['straight'] }, { valid: false, indications: ['left'] }];
    const stepsWithLanes = [
      { ...STEP_A, intersections: [{ lanes }] },
      STEP_B,
      STEP_C,
    ];
    const rdWithLanes = makeRouteData(stepsWithLanes);
    const { result } = renderHook(() =>
      useNavigationStep(rdWithLanes, [121.150, 13.940], floodZones, vi.fn())
    );
    expect(result.current.currentLanes).toEqual(lanes);
  });

  it('clears isOffRoute when routeData changes', () => {
    vi.useFakeTimers();
    // Place user far from route to trigger off-route detection
    const farLocation = [121.200, 13.940]; // well outside 50m snap threshold
    const onReroute = vi.fn();
    const { result, rerender } = renderHook(
      ({ loc, rd }) => useNavigationStep(rd, loc, floodZones, onReroute),
      { initialProps: { loc: farLocation, rd: routeData } }
    );
    // Advance timers to trigger off-route
    act(() => { vi.advanceTimersByTime(6000); });
    // Now provide a new route (simulating reroute completion)
    const newRoute = makeRouteData([
      makeStep(121.200, 13.940, 'depart', undefined, 100),
      makeStep(121.202, 13.940, 'arrive', undefined, 0),
    ]);
    act(() => { rerender({ loc: farLocation, rd: newRoute }); });
    expect(result.current.isOffRoute).toBe(false);
    vi.useRealTimers();
  });

  it('does not annotate flood warnings for steps outside the flood zone', () => {
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
    // STEP_A is at lng 121.150, far from the flood zone at 121.152
    expect(result.current.stepsWithFloodWarning.has(0)).toBe(false);
  });
});
