import { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';

const ADVANCE_THRESHOLD_M = 30;
const OFF_ROUTE_THRESHOLD_M = 50;
const OFF_ROUTE_SECONDS = 5;

export default function useNavigationStep(routeData, userLocation, floodZones, onReroute) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToManeuver, setDistanceToManeuver] = useState(null);
  const [remainingDistance, setRemainingDistance] = useState(null);
  const [remainingDuration, setRemainingDuration] = useState(null);
  const [stepsWithFloodWarning, setStepsWithFloodWarning] = useState(new Set());
  const [currentLanes, setCurrentLanes] = useState(null);
  const [isOffRoute, setIsOffRoute] = useState(false);

  const offRouteTimer = useRef(null);
  const lastRerouteRef = useRef(0);
  const stepIndexRef = useRef(0);

  const steps = routeData?.safeRoute?.route?.legs?.[0]?.steps ?? [];
  const routeGeometry = routeData?.safeRoute?.geometry ?? null;

  // Reset when route changes
  useEffect(() => {
    setCurrentStepIndex(0);
    stepIndexRef.current = 0;
    setIsOffRoute(false);
    if (offRouteTimer.current) clearTimeout(offRouteTimer.current);
  }, [routeData]);

  // Annotate flood warnings once per route/floodZones change
  useEffect(() => {
    if (!steps.length || !floodZones?.features?.length) {
      setStepsWithFloodWarning(new Set());
      return;
    }
    const warned = new Set();
    steps.forEach((step, idx) => {
      if (!step.geometry?.coordinates?.length) return;
      const line = turf.lineString(step.geometry.coordinates);
      if (floodZones.features.some(zone => turf.booleanIntersects(line, zone))) {
        warned.add(idx);
      }
    });
    setStepsWithFloodWarning(warned);
  }, [routeData, floodZones]);

  // Extract lane data for current step
  useEffect(() => {
    if (!steps.length) { setCurrentLanes(null); return; }
    const step = steps[stepIndexRef.current];
    const intersection = step?.intersections?.find(i => i.lanes?.length >= 2);
    setCurrentLanes(intersection?.lanes ?? null);
  }, [currentStepIndex, routeData]);

  // Track position
  useEffect(() => {
    if (!userLocation || !steps.length) return;

    const idx = stepIndexRef.current;
    const nextStep = steps[idx + 1] ?? steps[idx];
    const maneuverPt = turf.point(nextStep.maneuver.location);
    const userPt = turf.point(userLocation);

    const distM = turf.distance(userPt, maneuverPt, { units: 'meters' });
    setDistanceToManeuver(Math.round(distM));

    const remaining = steps.slice(idx).reduce(
      (acc, s) => ({ d: acc.d + s.distance, t: acc.t + s.duration }),
      { d: 0, t: 0 }
    );
    setRemainingDistance(Math.round(remaining.d));
    setRemainingDuration(Math.round(remaining.t));

    // Advance step
    if (distM <= ADVANCE_THRESHOLD_M && idx < steps.length - 1) {
      const next = idx + 1;
      stepIndexRef.current = next;
      setCurrentStepIndex(next);
      return;
    }

    // Off-route detection
    if (routeGeometry?.coordinates?.length > 1) {
      const routeLine = turf.lineString(routeGeometry.coordinates);
      const snapped = turf.nearestPointOnLine(routeLine, userPt);
      const snapDistM = turf.distance(userPt, snapped, { units: 'meters' });

      if (snapDistM > OFF_ROUTE_THRESHOLD_M) {
        if (!offRouteTimer.current) {
          offRouteTimer.current = setTimeout(() => {
            const now = Date.now();
            if (now - lastRerouteRef.current > 15000) {
              lastRerouteRef.current = now;
              setIsOffRoute(true);
              onReroute?.(userLocation);
            }
            offRouteTimer.current = null;
          }, OFF_ROUTE_SECONDS * 1000);
        }
      } else {
        if (offRouteTimer.current) {
          clearTimeout(offRouteTimer.current);
          offRouteTimer.current = null;
        }
      }
    }
  }, [userLocation]);

  return {
    currentStepIndex,
    currentStep: steps[currentStepIndex] ?? null,
    steps,
    distanceToManeuver,
    remainingDistance,
    remainingDuration,
    stepsWithFloodWarning,
    currentLanes,
    isOffRoute,
  };
}
