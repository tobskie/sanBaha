import { useState, useEffect, useRef, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/admin/AdminLayout';
import AdminMedia from './components/admin/AdminMedia';
import AdminReports from './components/admin/AdminReports';
import AdminSensors from './components/admin/AdminSensors';
import AdminUsers from './components/admin/AdminUsers';
import AdminAlerts from './components/admin/AdminAlerts';
import AdminLogs from './components/admin/AdminLogs';
import FloodMap from './components/FloodMap';
import BottomSheet from './components/BottomSheet';
import MobileHeader from './components/MobileHeader';
import HotspotDetail from './components/HotspotDetail';
import HotspotMiniCard from './components/HotspotMiniCard';
import NavigationPanel from './components/NavigationPanel';
import ReportFloodPanel from './components/ReportFloodPanel';
import HazardMapPanel from './components/HazardMapPanel';
import LoginPrompt from './components/LoginPrompt';
import { getStatusFromWaterLevel } from './data/mockData';
import { getSmartRouteWithAvoidance, createFloodZones, checkRouteIntersection, loadHistoricalFloodZones, mergeHistoricalZones, findSafestRoute } from './services/routingService';
import { subscribeToFloodData, submitFloodReport, subscribeToCrowdReports } from './services/firebase';
import { isRainfallActive } from './services/weatherService';
import { useAuth } from './contexts/AuthContext';
import { useAdmin } from './contexts/AdminContext';
import { useUploadQueue } from './hooks/useUploadQueue';
import { useReviewQueue } from './hooks/useReviewQueue';
import useVehicleProfile from './hooks/useVehicleProfile';
import { PRESET_VEHICLES } from './data/vehicles';
import { ref as fRef, set as fSet } from 'firebase/database';
import { database as db } from './services/firebase';
import Toast from './components/Toast';
import ReviewQueuePanel from './components/ReviewQueuePanel';
import NavigationBanner from './components/NavigationBanner';
import useNavigationStep from './hooks/useNavigationStep';
import Sidebar from './components/Sidebar';
import { useIsMobile } from './hooks/useIsMobile';

function App() {
  const { user, requireAuth, logout } = useAuth();
  const { isAdmin } = useAdmin();
  const { enqueue: enqueueUpload } = useUploadQueue();
  const pendingReviewCount = useReviewQueue();
  const { vehicle, setVehicle } = useVehicleProfile();
  const [toast, setToast] = useState(null);
  const [sensorHotspots, setSensorHotspots] = useState([]);
  const [crowdHotspots, setCrowdHotspots] = useState([]);
  const hotspots = useMemo(() => [...sensorHotspots, ...crowdHotspots], [sensorHotspots, crowdHotspots]);
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [destination, setDestination] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(210);
  const [floodAlertData, setFloodAlertData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Routing state
  const [routeData, setRouteData] = useState(null);
  const [floodZones, setFloodZones] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [userHeading, setUserHeading] = useState(0);
  const [isLocationAcquired, setIsLocationAcquired] = useState(false);
  const [showNavigationPanel, setShowNavigationPanel] = useState(false);
  const [originLocation, setOriginLocation] = useState(null);
  const [destLocation, setDestLocation] = useState(null);
  const [isFollowMode, setIsFollowMode] = useState(false);

  const [showReportPanel, setShowReportPanel] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);

  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try { return localStorage.getItem('sanBaha_sidebarOpen') !== 'false'; } catch { return true; }
  });

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [showHistoricalData, setShowHistoricalData] = useState(false);
  const [showHazardMap, setShowHazardMap] = useState(false);
  const [weatherData, setWeatherData] = useState(null);

  // Settings state
  const [showFloodZones, setShowFloodZones] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Ref for map controls and previous location
  const mapRef = useRef(null);
  const prevLocationRef = useRef(null);
  const watchIdRef = useRef(null);
  const isLocationAcquiredRef = useRef(false);
  const prevSensorStatusesRef = useRef({});

  const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw';

  // Calculate heading from previous to current position
  const calculateHeading = (prev, current) => {
    if (!prev || !current) return 0;
    const dx = current[0] - prev[0];
    const dy = current[1] - prev[1];
    // Only update heading if we've moved a significant amount
    if (Math.abs(dx) < 0.00001 && Math.abs(dy) < 0.00001) return null;
    // Convert to degrees (0 = North, 90 = East)
    const angle = Math.atan2(dx, dy) * (180 / Math.PI);
    return (angle + 360) % 360;
  };

  // Continuous GPS tracking
  useEffect(() => {
    if (navigator.geolocation) {
      const ACCURACY_THRESHOLD_M = 200; // accept positions up to 200m accuracy
      const FALLBACK_TIMEOUT_MS = 10000; // after 10s, accept whatever we have

      // Show last-known position immediately so the marker is visible on startup.
      // isLocationAcquired stays false until watchPosition delivers an accurate fix.
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = [position.coords.longitude, position.coords.latitude];
          setUserLocation(newLocation);
          prevLocationRef.current = newLocation;
        },
        () => { /* silent — watchPosition will handle errors */ },
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: 5000 }
      );

      // Fallback: if no accurate fix within FALLBACK_TIMEOUT_MS, accept any position
      const fallbackTimer = setTimeout(() => {
        if (!isLocationAcquiredRef.current) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const newLocation = [position.coords.longitude, position.coords.latitude];
              setUserLocation(newLocation);
              setIsLocationAcquired(true);
              isLocationAcquiredRef.current = true;
              prevLocationRef.current = newLocation;
            },
            () => {},
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 }
          );
        }
      }, FALLBACK_TIMEOUT_MS);

      // Watch position for real-time updates — maximumAge:0 forces fresh GPS reads
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          // Reject fixes that are too inaccurate (but fallback timer handles the timeout case)
          if (position.coords.accuracy > ACCURACY_THRESHOLD_M) return;

          const newLocation = [position.coords.longitude, position.coords.latitude];

          // Calculate heading from movement if device heading not available
          if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
            setUserHeading(position.coords.heading);
          } else if (prevLocationRef.current) {
            const calculatedHeading = calculateHeading(prevLocationRef.current, newLocation);
            if (calculatedHeading !== null) {
              setUserHeading(calculatedHeading);
            }
          }

          setUserLocation(newLocation);
          setIsLocationAcquired(true);
          isLocationAcquiredRef.current = true;
          prevLocationRef.current = newLocation;
        },
        (error) => {
          console.error('Watch position error:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,  // never serve a cached position
          timeout: 30000, // allow up to 30s for a cold GPS fix
        }
      );

      // Cleanup on unmount
      return () => {
        clearTimeout(fallbackTimer);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      };
    } else {
      setUserLocation([121.1589, 13.9411]);
    }
  }, []);

  // Update flood zones when hotspots change
  useEffect(() => {
    const zones = createFloodZones(hotspots, vehicle);
    setFloodZones(zones);
  }, [hotspots, vehicle]);

  // Real-time flood data subscription (controlled by autoRefresh setting)
  useEffect(() => {
    if (!autoRefresh) return;

    const unsubscribe = subscribeToFloodData((data) => {
      if (data && data.length > 0) {
        if (soundAlerts) {
          data.forEach((sensor) => {
            const prevStatus = prevSensorStatusesRef.current[sensor.id];
            if (sensor.status === 'flooded' && prevStatus !== 'flooded') {
              try {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                osc.connect(ctx.destination);
                osc.frequency.value = 880;
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
              } catch (_) { /* AudioContext not available */ }
            }
          });
        }
        data.forEach((sensor) => {
          prevSensorStatusesRef.current[sensor.id] = sensor.status;
        });
        setSensorHotspots(data);
        setLastUpdate(new Date());
      }
    });

    return () => unsubscribe();
  }, [autoRefresh, soundAlerts]);

  // Real-time crowd reports
  useEffect(() => {
    const unsubscribe = subscribeToCrowdReports(setCrowdHotspots);
    return () => unsubscribe();
  }, []);


  const handleHotspotSelect = (hotspot) => {
    setSelectedHotspot(hotspot);
    setShowDetail(false);
    if (isBottomSheetExpanded) {
      setIsBottomSheetExpanded(false);
    }
  };

  const handleReroute = async (newOrigin) => {
    if (!destLocation?.coordinates) return;
    try {
      const result = await getSmartRouteWithAvoidance(
        newOrigin,
        destLocation.coordinates,
        hotspots,
        vehicle
      );
      if (result.success) {
        setRouteData(result);
      }
    } catch {
      // isOffRoute auto-clears when routeData changes; if reroute fails just wait
    }
  };

  const {
    currentStep,
    steps: navSteps,
    distanceToManeuver,
    remainingDistance,
    remainingDuration,
    stepsWithFloodWarning,
    currentLanes,
    isOffRoute,
    isArrived,
  } = useNavigationStep(routeData, userLocation, floodZones, handleReroute, () => {
    // Auto-end navigation 4 seconds after arrival
    setTimeout(() => handleStopNavigation(), 4000);
  });

  // Navigate with coordinates
  const handleNavigateWithCoords = async (origin, dest) => {
    setIsRouting(true);
    try {
      const result = await getSmartRouteWithAvoidance(origin, dest, hotspots, vehicle);

      if (result.success) {
        // If rain is active and historical data is enabled, merge historical
        // flood zones into the avoidance set and re-score the routes
        if (showHistoricalData && isRainfallActive(weatherData)) {
          const historicalGeoJSON = await loadHistoricalFloodZones();
          if (historicalGeoJSON && result.floodZones) {
            const mergedZones = mergeHistoricalZones(result.floodZones, historicalGeoJSON);
            // Re-score all candidate routes against the merged zones so the
            // 250K historical penalty actually influences route selection
            const rawRoutes = result.allRoutes.map(r => r.route);
            const reScored = findSafestRoute(rawRoutes, mergedZones);
            result.floodZones = mergedZones;
            result.safeRoute = reScored.safeRoute;
            result.allRoutes = reScored.allRoutes;
            result.hasSafeRoute = reScored.hasSafeRoute;
            result.warnings = reScored.warnings;
            result.precautionaryWarnings = reScored.precautionaryWarnings;
            result.historicalWarnings = reScored.historicalWarnings;
          }
        }

        setRouteData(result);
        setShowNavigationPanel(false);
        setSelectedHotspot(null);
        setIsFollowMode(true); // Start following user like Google Maps

        // Pre-warm service worker tile cache for the route
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller && result?.safeRoute?.geometry) {
          const coords = result.safeRoute.geometry.coordinates;
          const lngs = coords.map(c => c[0]);
          const lats = coords.map(c => c[1]);
          const bbox = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
          navigator.serviceWorker.controller.postMessage({ type: 'START_NAV', bbox, token: MAPBOX_TOKEN });
        }

        if (result.unavoidable) {
          setFloodAlertData(result);
          return;
        }

        let toastMsg = 'Route found! Follow blue line.';
        let toastType = 'info';
        if (result.historicalWarnings?.length > 0) {
          toastMsg = 'Route adjusted to avoid historically flood-prone areas.';
        }
        setToast({ message: toastMsg, type: toastType });
      } else {
        setToast({ message: 'Could not find a route: ' + result.error, type: 'error' });
      }
    } catch (error) {
      console.error('Routing error:', error);
      setToast({ message: 'Error calculating route', type: 'error' });
    } finally {
      setIsRouting(false);
    }
  };

  // Recalculate route if current route becomes flooded due to sensor updates
  const lastCheckedZonesRef = useRef(null);
  useEffect(() => {
    if (!routeData || !routeData.safeRoute || isRouting || !floodZones) return;
    if (lastCheckedZonesRef.current === floodZones) return;
    
    lastCheckedZonesRef.current = floodZones;

    const routeGeoJSON = {
      type: 'Feature',
      geometry: routeData.safeRoute.geometry
    };
    
    const intersection = checkRouteIntersection(routeGeoJSON, floodZones);

    if (intersection.intersects) {
      setToast({ message: 'High flood levels detected on your route! Re-routing to a safer way...', type: 'warning' });
      const currentOrigin = userLocation || routeData.origin;
      handleNavigateWithCoords(currentOrigin, routeData.destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floodZones, routeData, isRouting, userLocation]);

  // Navigate to a hotspot
  const handleNavigate = async (hotspot) => {
    if (!requireAuth()) return;
    if (!userLocation) {
      setToast({ message: 'Could not get your location. Please enable location services.', type: 'error' });
      return;
    }

    const dest = [hotspot.coordinates[1], hotspot.coordinates[0]];
    setDestination(hotspot.name);
    await handleNavigateWithCoords(userLocation, dest);
  };

  // Search for destination and navigate (from enhanced search)
  const handleSelectDestination = async (location) => {
    if (!requireAuth()) return;
    if (!userLocation) {
      setToast({ message: 'Could not get your location. Please enable location services.', type: 'error' });
      return;
    }
    setDestination(location.name);
    setDestLocation(location);
    await handleNavigateWithCoords(userLocation, location.coordinates);
  };

  // Clear route
  const handleClearRoute = () => {
    setRouteData(null);
    setDestination('');
    setDestLocation(null);
    setIsFollowMode(false);
  };

  // Stop navigation (clears route + notifies SW)
  const handleStopNavigation = () => {
    handleClearRoute();
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'END_NAV' });
    }
  };

  // Refresh button handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      // Data updates in real-time via Firebase, this just updates the UI loading state
      setIsRefreshing(false);
    }, 1000);
  };

  // Recenter button handler
  const handleRecenter = () => {
    setSelectedHotspot(null);
    handleClearRoute();
    setShowNavigationPanel(false);
    if (mapRef.current) {
      mapRef.current.flyToCenter();
    }
  };

  // My Location button handler
  const handleMyLocation = () => {
    if (mapRef.current) {
      mapRef.current.getCurrentLocation();
    }
  };

  // Open navigation panel
  const handleOpenNavigation = () => {
    if (!requireAuth()) return;
    setShowNavigationPanel(true);
    setSelectedHotspot(null);
  };

  // Handle crowdsourced flood report submission
  const handleReportSubmit = async (report, mediaFile) => {
    try {
      await submitFloodReport(report);
    } catch (err) {
      console.error('submitFloodReport failed:', err);
      setToast({ message: 'Failed to save report. Please try again.', type: 'error' });
      return;
    }

    // Write /media_uploads metadata; upload queue fills in storage paths
    if (mediaFile && user) {
      await fSet(fRef(db, `media_uploads/${report.id}`), {
        reportId: report.id,
        uploaderId: user.uid,
        uploaderName: user.displayName || 'Anonymous',
        type: mediaFile.type.startsWith('video/') ? 'video' : 'photo',
        fileSize: mediaFile.size,
        coordinates: report.coordinates,
        capturedAt: new Date().toISOString(),
        uploadedAt: null,
        processingStatus: 'queued',
      });
      await enqueueUpload(report.id, mediaFile);
    }

    // No manual hotspot push needed — subscribeToCrowdReports fires automatically
    setToast({ message: 'Flood report submitted!', type: 'success' });
  };

  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/reports" replace />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="sensors" element={<AdminSensors />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="alerts" element={<AdminAlerts />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="media" element={<AdminMedia />} />
        </Route>
      <Route path="/*" element={
      <div className="h-full w-full bg-[#0a1628] overflow-hidden relative">
      {/* Portal target for expanded search (must be at app root to escape BottomSheet overflow) */}
      <div id="search-portal" className="absolute inset-0 z-[2500] pointer-events-none [&>*]:pointer-events-auto" />
      {/* Mobile Header */}
      <MobileHeader
        lastUpdate={lastUpdate}
        onMenuClick={() => setIsMobileMenuOpen(true)}
        onNavigateClick={handleOpenNavigation}
        isAdmin={isAdmin}
        pendingReviewCount={pendingReviewCount}
      />

      {/* Map Container */}
      <div
        className="absolute inset-0"
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          left: !isMobile && isSidebarOpen ? 320 : 0,
          transition: 'left 0.2s ease',
        }}
      >
        <FloodMap
          ref={mapRef}
          hotspots={hotspots}
          selectedHotspot={selectedHotspot}
          onHotspotSelect={handleHotspotSelect}
          routeData={routeData}
          floodZones={floodZones}
          userLocation={userLocation}
          userHeading={userHeading}
          isLocationAcquired={isLocationAcquired}
          isFollowMode={isFollowMode}
          onFollowModeChange={setIsFollowMode}
          showHistoricalData={showHistoricalData}
          isRaining={isRainfallActive(weatherData)}
          onWeatherUpdate={setWeatherData}
          showFloodZones={showFloodZones}
          bottomOffset={isMobile ? bottomSheetHeight : 0}
          topOffset={currentStep ? 90 : 0}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      </div>

      {/* Navigation Panel */}
      {showNavigationPanel && (
        <NavigationPanel
          origin={originLocation}
          destination={destLocation}
          onOriginChange={setOriginLocation}
          onDestinationChange={(loc) => {
            setDestLocation(loc);
            if (loc) setDestination(loc.name);
          }}
          onNavigate={handleNavigateWithCoords}
          onClose={() => setShowNavigationPanel(false)}
          isRouting={isRouting}
          userLocation={userLocation}
          vehicle={vehicle}
        />
      )}

      {/* Report Flood Panel */}
      <ReportFloodPanel
        isOpen={showReportPanel}
        onClose={() => setShowReportPanel(false)}
        userLocation={userLocation}
        onSubmit={handleReportSubmit}
        onError={(msg) => setToast({ message: msg, type: 'error' })}
      />


      {/* Navigation Banner */}
      <NavigationBanner
        currentStep={currentStep}
        steps={navSteps}
        distanceToManeuver={distanceToManeuver}
        remainingDistance={remainingDistance}
        remainingDuration={remainingDuration}
        destination={destination}
        stepsWithFloodWarning={stepsWithFloodWarning}
        currentLanes={currentLanes}
        isOffRoute={isOffRoute}
        isArrived={isArrived}
        onEnd={handleStopNavigation}
      />

      {/* Hotspot mini-card — tap More Info to expand */}
      {isMobile && selectedHotspot && !routeData && !showNavigationPanel && !showDetail && (
        <HotspotMiniCard
          hotspot={selectedHotspot}
          onMoreInfo={() => setShowDetail(true)}
          onClose={() => setSelectedHotspot(null)}
        />
      )}

      {/* Hotspot full detail — shown after tapping More Info */}
      {isMobile && selectedHotspot && !routeData && !showNavigationPanel && showDetail && (
        <HotspotDetail
          hotspot={selectedHotspot}
          onClose={() => { setSelectedHotspot(null); setShowDetail(false); }}
          onNavigate={() => handleNavigate(selectedHotspot)}
          isRouting={isRouting}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}

      {/* Sidebar — tablet+ only */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(o => {
          const next = !o;
          try { localStorage.setItem('sanBaha_sidebarOpen', String(next)); } catch {}
          return next;
        })}
        hotspots={hotspots}
        selectedHotspot={!isMobile ? selectedHotspot : null}
        onHotspotSelect={(h) => { setSelectedHotspot(h); setShowDetail(false); }}
        onNavigate={handleNavigate}
        isRouting={isRouting}
        onReport={() => setShowReportPanel(true)}
        onSelectDestination={handleSelectDestination}
        onOpenNavigation={handleOpenNavigation}
        userLocation={userLocation}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onError={(msg) => setToast({ message: msg, type: 'error' })}
      />

      {/* Bottom Sheet */}
      <BottomSheet
        hotspots={hotspots}
        selectedHotspot={selectedHotspot}
        onHotspotSelect={handleHotspotSelect}
        onSelectDestination={handleSelectDestination}
        onOpenNavigation={handleOpenNavigation}
        onNavigate={handleNavigate}
        isExpanded={isBottomSheetExpanded}
        onToggleExpand={(expanded) => {
          setIsBottomSheetExpanded(expanded);
          setBottomSheetHeight(expanded ? Math.round(window.innerHeight * 0.7) : 210);
        }}
        onSheetHeightChange={setBottomSheetHeight}
        isRouting={isRouting}
        userLocation={userLocation}
        onReport={() => setShowReportPanel(true)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="absolute inset-0 z-[2000] flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85%] h-full ml-auto glass-card animate-slide-in">
            {/* Menu Header with User Profile */}
            <div className="p-4 border-b border-[#00d4ff]/10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-white">Menu</h2>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* User Profile Section */}
              {user ? (
                <div className="flex items-center gap-3 p-2 rounded-xl bg-[#162d4d]">
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="w-9 h-9 rounded-full border-2 border-[#00d4ff]/40"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{user.displayName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    requireAuth();
                  }}
                  className="w-full p-2.5 rounded-xl bg-gradient-to-r from-[#00d4ff]/10 to-[#00ff88]/10 border border-[#00d4ff]/20 text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
                >
                  <div className="w-9 h-9 rounded-full bg-[#162d4d] flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span className="text-slate-300">Sign in with Google</span>
                </button>
              )}
            </div>
            <div className="p-4 space-y-2">
              {isAdmin && pendingReviewCount > 0 && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setShowReviewQueue(true);
                  }}
                  className="w-full p-3 rounded-xl bg-gradient-to-r from-red-500/20 to-amber-500/20 border border-red-500/30 text-left text-white flex items-center justify-between active:scale-[0.98] transition-transform text-sm"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Review Queue
                  </div>
                  <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold">
                    {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                  </span>
                </button>
              )}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenNavigation();
                }}
                className="w-full p-3 rounded-xl bg-gradient-to-r from-[#00d4ff]/20 to-[#00ff88]/20 border border-[#00d4ff]/30 text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
              >
                <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Navigate
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowReportPanel(true);
                }}
                className="w-full p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-red-500/20 border border-amber-500/30 text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
              >
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Report Flood
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowHazardMap(true);
                }}
                className="w-full p-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
              >
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Hazard Map (UP NOAH)
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowSettings(true);
                }}
                className="w-full p-3 rounded-xl bg-[#162d4d] text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
              >
                <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowAbout(true);
                }}
                className="w-full p-3 rounded-xl bg-[#162d4d] text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
              >
                <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                About sanBaha
              </button>

              {/* Open Source References */}
              <div className="rounded-xl overflow-hidden border border-[#00d4ff]/10">
                <button
                  onClick={() => setShowCredits(c => !c)}
                  className="w-full p-3 bg-[#162d4d] text-left text-white flex items-center gap-3 active:scale-[0.98] transition-transform text-sm"
                >
                  <svg className="w-5 h-5 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <span className="flex-1">Open Source</span>
                  <svg
                    className="w-4 h-4 text-slate-500 transition-transform duration-200"
                    style={{ transform: showCredits ? 'rotate(180deg)' : '' }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showCredits && (
                  <div className="bg-[#0d1f35] px-3 pb-3 pt-2 space-y-2">
                    {[
                      { name: 'Open-Meteo', desc: 'Weather forecasts', url: 'https://open-meteo.com', color: '#00d4ff' },
                      { name: 'Mapbox', desc: 'Map tiles & routing', url: 'https://www.mapbox.com', color: '#00d4ff' },
                      { name: 'OpenStreetMap', desc: 'Map data & geocoding', url: 'https://www.openstreetmap.org', color: '#00ff88' },
                      { name: 'UP NOAH', desc: 'Flood hazard maps', url: 'https://noah.up.edu.ph', color: '#fbbf24' },
                      { name: 'Firebase', desc: 'Database & auth', url: 'https://firebase.google.com', color: '#f97316' },
                      { name: 'Turf.js', desc: 'Geospatial analysis', url: 'https://turfjs.org', color: '#00ff88' },
                      { name: 'React', desc: 'UI framework', url: 'https://react.dev', color: '#00d4ff' },
                      { name: 'Tailwind CSS', desc: 'Styling', url: 'https://tailwindcss.com', color: '#00d4ff' },
                    ].map(({ name, desc, url, color }) => (
                      <a
                        key={name}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#162d4d]/60 active:scale-[0.98] transition-transform"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white">{name}</p>
                          <p className="text-[10px] text-slate-400">{desc}</p>
                        </div>
                        <svg className="w-3 h-3 flex-shrink-0" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#00d4ff]/10" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              {user ? (
                <button
                  onClick={() => { setIsMobileMenuOpen(false); logout(); }}
                  className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium active:scale-[0.98] transition-transform"
                >
                  Sign Out
                </button>
              ) : (
                <p className="text-xs text-center text-slate-500">
                  sanBaha v1.0.0
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-[2001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative glass-card rounded-2xl w-full max-w-sm overflow-hidden animate-slide-in">
            <div className="p-4 border-b border-[#00d4ff]/10 flex items-center justify-between">
              <h2 className="font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
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
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#162d4d]">
                <div>
                  <p className="text-sm text-white">Historical Flood Zones (5-Year)</p>
                  <p className="text-[10px] text-slate-400">Display UP NOAH historical data</p>
                </div>
                <div 
                  className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${showHistoricalData ? 'bg-[#00d4ff]/30' : 'bg-slate-700'}`}
                  onClick={() => setShowHistoricalData(!showHistoricalData)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${showHistoricalData ? 'right-0.5 bg-[#00d4ff]' : 'left-0.5 bg-slate-500'}`} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#162d4d]">
                <div>
                  <p className="text-sm text-white">Show Flood Zones</p>
                  <p className="text-[10px] text-slate-400">Display flood risk areas on map</p>
                </div>
                <div
                  className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${showFloodZones ? 'bg-[#00d4ff]/30' : 'bg-slate-700'}`}
                  onClick={() => setShowFloodZones(!showFloodZones)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${showFloodZones ? 'right-0.5 bg-[#00d4ff]' : 'left-0.5 bg-slate-500'}`} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#162d4d]">
                <div>
                  <p className="text-sm text-white">Sound Alerts</p>
                  <p className="text-[10px] text-slate-400">Play sound for flood warnings</p>
                </div>
                <div
                  className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${soundAlerts ? 'bg-[#00d4ff]/30' : 'bg-slate-700'}`}
                  onClick={() => setSoundAlerts(!soundAlerts)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${soundAlerts ? 'right-0.5 bg-[#00d4ff]' : 'left-0.5 bg-slate-500'}`} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#162d4d]">
                <div>
                  <p className="text-sm text-white">Auto-refresh Data</p>
                  <p className="text-[10px] text-slate-400">Receive live sensor updates</p>
                </div>
                <div
                  className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${autoRefresh ? 'bg-[#00d4ff]/30' : 'bg-slate-700'}`}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${autoRefresh ? 'right-0.5 bg-[#00d4ff]' : 'left-0.5 bg-slate-500'}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAbout && (
        <div className="absolute inset-0 z-[2001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAbout(false)} />
          <div className="relative glass-card rounded-2xl w-full max-w-sm overflow-hidden animate-slide-in">
            <div className="p-4 border-b border-[#00d4ff]/10 flex items-center justify-between">
              <h2 className="font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                About sanBaha
              </h2>
              <button
                onClick={() => setShowAbout(false)}
                className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-[#0a1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">sanBaha</h3>
                <p className="text-[#00d4ff] text-sm">Flood-Safe Navigation</p>
              </div>
              <div className="space-y-2 text-center">
                <p className="text-xs text-slate-400">
                  Navigate safely through Lipa City with real-time flood monitoring and smart routing that avoids flooded areas.
                </p>
                <div className="text-xs text-slate-400 py-2">
                  <p className="font-semibold text-white mb-1">Founders:</p>
                  <p>Raven Belen, Jacov Endaya</p>
                  <p>Kurt Panganiban, Toby Olimpo</p>
                </div>
                <p className="text-xs text-slate-500">
                  Version 1.0.0 • Made with 💙 for Lipa City
                </p>
              </div>
              <div className="pt-2 border-t border-[#00d4ff]/10">
                <p className="text-[10px] text-slate-500 text-center">
                  © 2026 sanBaha Team. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login Prompt Modal */}
      <LoginPrompt />

      {/* Flood Alert Modal — shown when all routes are unavoidably flooded */}
      {floodAlertData && (
        <div className="absolute inset-0 z-[2500] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setFloodAlertData(null)} />
          <div className="relative glass-card rounded-2xl p-5 max-w-xs w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Area Not Passable</h3>
                <p className="text-[10px] text-red-400">All routes cross flooded areas</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              No safe route could be found. All available roads to your destination pass through active flood zones. Travelling this route may be dangerous.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFloodAlertData(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#162d4d] text-slate-300 text-sm font-medium active:scale-[0.98] transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setRouteData(floodAlertData);
                  setFloodAlertData(null);
                  setShowNavigationPanel(false);
                  setSelectedHotspot(null);
                  setIsFollowMode(true);
                  setToast({ message: 'Proceeding through flood zone. Stay safe.', type: 'warning' });
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-semibold active:scale-[0.98] transition-transform"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Queue Panel */}
      <ReviewQueuePanel isOpen={showReviewQueue} onClose={() => setShowReviewQueue(false)} />

      {/* Hazard Map Panel */}
      <HazardMapPanel 
        isOpen={showHazardMap} 
        onClose={() => setShowHazardMap(false)} 
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
      } />
    </Routes>
  );
}

export default App;
