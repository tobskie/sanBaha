import { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';

const ADVANCE_THRESHOLD_M = 30;
const ARRIVE_THRESHOLD_M = 30;
const OFF_ROUTE_THRESHOLD_M = 50;
const OFF_ROUTE_SECONDS = 5;
const REROUTE_COOLDOWN_MS = 15000;

export default function useNavigationStep(routeData, userLocation, floodZones, onReroute, onArrive) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToManeuver, setDistanceToManeuver] = useState(null);
  const [remainingDistance, setRemainingDistance] = useState(null);
  const [remainingDuration, setRemainingDuration] = useState(null);
  const [stepsWithFloodWarning, setStepsWithFloodWarning] = useState(new Set());
  const [currentLanes, setCurrentLanes] = useState(null);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [isArrived, setIsArrived] = useState(false);

  const offRouteTimer = useRef(null);
  const lastRerouteRef = useRef(0);
  const stepIndexRef = useRef(0);
  const arrivedRef = useRef(false);

  const onRerouteRef = useRef(onReroute);
  useEffect(() => { onRerouteRef.current = onReroute; }, [onReroute]);
  const onArriveRef = useRef(onArrive);
  useEffect(() => { onArriveRef.current = onArrive; }, [onArrive]);

  const steps = routeData?.safeRoute?.route?.legs?.[0]?.steps ?? [];
  const routeGeometry = routeData?.safeRoute?.geometry ?? null;

  // Reset when route changes
  useEffect(() => {
    setCurrentStepIndex(0);
    stepIndexRef.current = 0;
    setIsOffRoute(false);
    setIsArrived(false);
    arrivedRef.current = false;
    if (offRouteTimer.current) {
      clearTimeout(offRouteTimer.current);
      offRouteTimer.current = null; // FIX 3: null after clearTimeout
    }
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
    const step = steps[currentStepIndex]; // FIX 4: use currentStepIndex not stepIndexRef.current
    const intersection = [...(step?.intersections ?? [])].reverse().find(i => i.lanes?.length >= 2) ?? null;
    setCurrentLanes(intersection?.lanes ?? null);
  }, [currentStepIndex, routeData]);

  // Track position
  useEffect(() => {
    if (!userLocation || !steps.length) return;

    const idx = stepIndexRef.current;

    // FIX 2: distanceToManeuver measures to current step's maneuver location
    const currentStep = steps[idx];
    const nextManeuverStep = steps[idx + 1];

    const maneuverPt = turf.point(currentStep.maneuver.location);
    const userPt = turf.point(userLocation);

    const distM = turf.distance(userPt, maneuverPt, { units: 'meters' });
    setDistanceToManeuver(Math.round(distM));

    const remaining = steps.slice(idx).reduce(
      (acc, s) => ({ d: acc.d + s.distance, t: acc.t + s.duration }),
      { d: 0, t: 0 }
    );
    setRemainingDistance(Math.round(remaining.d));
    setRemainingDuration(Math.round(remaining.t));

    // Arrival detection — last step or maneuver type 'arrive'
    const isLastStep = !nextManeuverStep || currentStep.maneuver?.type === 'arrive';
    if (isLastStep && !arrivedRef.current) {
      if (distM <= ARRIVE_THRESHOLD_M) {
        arrivedRef.current = true;
        setIsArrived(true);
        onArriveRef.current?.();
        return;
      }
    }

    // Advance step when close to NEXT maneuver
    if (nextManeuverStep) {
      const nextManeuverPt = turf.point(nextManeuverStep.maneuver.location);
      const distToNext = turf.distance(userPt, nextManeuverPt, { units: 'meters' });
      if (distToNext <= ADVANCE_THRESHOLD_M) {
        const next = idx + 1;
        stepIndexRef.current = next;
        setCurrentStepIndex(next);
        return;
      }
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
            if (now - lastRerouteRef.current > REROUTE_COOLDOWN_MS) { // FIX 6: named constant
              lastRerouteRef.current = now;
              setIsOffRoute(true);
              onRerouteRef.current?.(userLocation); // FIX 1: use ref
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

    // FIX 5: cleanup for offRouteTimer on unmount/re-run
    return () => {
      if (offRouteTimer.current) {
        clearTimeout(offRouteTimer.current);
        offRouteTimer.current = null;
      }
    };
  }, [userLocation, steps, routeGeometry]); // FIX 1: dep array (onReroute omitted, in ref)

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
    isArrived,
  };
}
