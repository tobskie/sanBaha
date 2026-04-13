import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
