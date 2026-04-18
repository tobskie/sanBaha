# Responsive Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible left sidebar on `md+` (768px+) screens that replaces the BottomSheet with a persistent flood stats panel, while leaving the mobile layout unchanged.

**Architecture:** A new `Sidebar.jsx` component renders absolutely on the left side of the screen on `md+` and slides in/out. The map container's left edge shifts by 320px when the sidebar is open. BottomSheet gains `md:hidden`. HotspotDetail gains an `inline` prop so Sidebar can render it without absolute positioning.

**Tech Stack:** React, Tailwind CSS (md breakpoint = 768px), inline styles for JS-driven transitions

---

### Task 1: `useIsMobile` hook

**Files:**
- Create: `src/hooks/useIsMobile.js`

- [ ] **Step 1: Create the hook**

```js
// src/hooks/useIsMobile.js
import { useState, useEffect } from 'react';

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useIsMobile.js
git commit -m "feat: add useIsMobile hook for responsive breakpoint detection"
```

---

### Task 2: Add `inline` prop to HotspotDetail

**Files:**
- Modify: `src/components/HotspotDetail.jsx:47`

- [ ] **Step 1: Wrap content and add inline prop**

Open `src/components/HotspotDetail.jsx`. The component currently returns:

```jsx
return (
  <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
    <div className="glass rounded-2xl p-3 shadow-xl border border-[#00d4ff]/20">
      {/* ... */}
    </div>
  </div>
);
```

Add the `inline` prop and make the outer wrapper conditional. Change the component signature and return:

```jsx
const HotspotDetail = ({ hotspot, onClose, onNavigate, isRouting, onError, inline = false }) => {
```

Then wrap the inner content in a variable and conditionally wrap it:

```jsx
  const content = (
    <div className="glass rounded-2xl p-3 shadow-xl border border-[#00d4ff]/20">
      {/* Header */}
      {/* ... all existing inner JSX unchanged ... */}
    </div>
  );

  if (inline) return content;
  return (
    <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
      {content}
    </div>
  );
```

The full replacement for the return statement in `HotspotDetail.jsx` (starting at the `return (` line near line 47):

```jsx
  const content = (
    <div className="glass rounded-2xl p-3 shadow-xl border border-[#00d4ff]/20">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              hotspot.status === 'clear'
                ? 'bg-emerald-500/20'
                : hotspot.status === 'warning'
                ? 'bg-amber-500/20'
                : 'bg-red-500/20'
            }`}
          >
            {hotspot.status === 'clear' ? (
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : hotspot.status === 'warning' ? (
              <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">{hotspot.name}</h3>
            <p className="text-[10px] text-slate-400">{hotspot.location}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Report image — only for crowdsourced with an uploaded media file */}
      {isCrowdsourced && mediaUrl && !isVideo && (
        <div className="mb-3 rounded-xl overflow-hidden max-h-32 bg-[#0a1628]">
          <img src={mediaUrl} alt="Flood report" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 bg-[#0a1628] rounded-lg text-center">
          <p
            className={`text-xl font-bold ${
              hotspot.status === 'clear'
                ? 'text-emerald-400'
                : hotspot.status === 'warning'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {hotspot.waterLevel}
          </p>
          <p className="text-[9px] text-slate-400">cm</p>
        </div>
        <div className="p-2 bg-[#0a1628] rounded-lg text-center">
          <p
            className={`text-xs font-bold ${
              hotspot.status === 'clear'
                ? 'text-emerald-400'
                : hotspot.status === 'warning'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {statusDetails.label}
          </p>
          <p className="text-[9px] text-slate-400">status</p>
        </div>
        <div className="p-2 bg-[#0a1628] rounded-lg text-center">
          <p className="text-xs font-bold text-[#00d4ff]">{formatTime(hotspot.lastUpdate)}</p>
          <p className="text-[9px] text-slate-400">updated</p>
        </div>
      </div>

      {/* Description — crowdsourced only */}
      {isCrowdsourced && hotspot.description && (
        <div className="mb-3 p-2.5 bg-[#0a1628] rounded-xl">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Description</span>
          <p className="text-xs text-slate-300 leading-relaxed">{hotspot.description}</p>
        </div>
      )}

      {/* Community Verification — crowdsourced only */}
      {isCrowdsourced && (
        <div className="mb-3 p-2.5 bg-[#0a1628] rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              Community Verification
            </span>
            {verified ? (
              <span className="text-[10px] font-semibold text-emerald-400">✓ Verified</span>
            ) : (
              <span className="text-[10px] text-slate-500">{count}/3</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <VerificationDots count={Math.min(count, 3)} />
            {hasVerified ? (
              <span className="text-[10px] text-emerald-400 font-medium">You verified this</span>
            ) : (
              <button
                onClick={handleVerify}
                disabled={submitting || verified}
                className={`
                  px-3 py-1 rounded-lg text-[10px] font-semibold transition-all active:scale-95
                  ${submitting
                    ? 'bg-[#162d4d] text-slate-500 cursor-not-allowed'
                    : verified
                    ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'}
                `}
              >
                {submitting ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : verified ? (
                  'Confirmed'
                ) : (
                  'Verify Flood'
                )}
              </button>
            )}
          </div>
          {error && <p className="mt-1.5 text-[10px] text-red-400">{error}</p>}
        </div>
      )}

      {/* Action Button — hidden for flooded zones */}
      {hotspot.status !== 'flooded' && (
        <button
          onClick={onNavigate}
          disabled={isRouting}
          className={`
            w-full py-2.5 rounded-xl font-medium text-xs
            flex items-center justify-center gap-2 transition-all active:scale-[0.98]
            ${isRouting
              ? 'opacity-50 cursor-not-allowed bg-[#162d4d] text-slate-400'
              : 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628]'}
          `}
        >
          {isRouting ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Calculating route...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Navigate Here
            </>
          )}
        </button>
      )}
    </div>
  );

  if (inline) return content;
  return (
    <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
      {content}
    </div>
  );
```

- [ ] **Step 2: Commit**

```bash
git add src/components/HotspotDetail.jsx
git commit -m "feat: add inline prop to HotspotDetail for sidebar rendering"
```

---

### Task 3: Create `Sidebar.jsx`

**Files:**
- Create: `src/components/Sidebar.jsx`

- [ ] **Step 1: Create the full Sidebar component**

```jsx
// src/components/Sidebar.jsx
import SensorCard from './SensorCard';
import HotspotDetail from './HotspotDetail';
import DestinationSearch from './DestinationSearch';

const Sidebar = ({
  isOpen,
  onToggle,
  hotspots,
  selectedHotspot,
  onHotspotSelect,
  onNavigate,
  isRouting,
  onReport,
  onSelectDestination,
  onOpenNavigation,
  userLocation,
  isRefreshing,
  onRefresh,
  onError,
}) => {
  const statusCounts = {
    clear: hotspots.filter(h => h.status === 'clear').length,
    warning: hotspots.filter(h => h.status === 'warning').length,
    flooded: hotspots.filter(h => h.status === 'flooded').length,
  };

  return (
    <>
      {/* Re-open tab — visible only when sidebar is collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-[1002] w-6 h-14 bg-[#162d4d] border border-[#00d4ff]/20 border-l-0 rounded-r-xl items-center justify-center text-slate-400 hover:text-[#00d4ff] transition-colors"
          aria-label="Open sidebar"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Sidebar panel */}
      <div
        className="hidden md:flex flex-col absolute left-0 top-0 bottom-0 z-[1001] w-[320px] bg-[#0a1628]/95 backdrop-blur-md border-r border-[#00d4ff]/20"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-320px)',
          transition: 'transform 0.2s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#0a1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm">sanBaha</span>
          </div>
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedHotspot ? (
            /* Hotspot detail view */
            <div className="p-3">
              <button
                onClick={() => onHotspotSelect(null)}
                className="flex items-center gap-2 text-slate-400 hover:text-white text-xs mb-3 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to list
              </button>
              <HotspotDetail
                hotspot={selectedHotspot}
                onClose={() => onHotspotSelect(null)}
                onNavigate={() => onNavigate(selectedHotspot)}
                isRouting={isRouting}
                onError={onError}
                inline={true}
              />
            </div>
          ) : (
            /* Default flood stats + list view */
            <div className="p-3 space-y-3">
              {/* Search */}
              <DestinationSearch
                onSelectDestination={onSelectDestination}
                onOpenNavigation={onOpenNavigation}
                isRouting={isRouting}
                userLocation={userLocation}
              />

              {/* Status summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-xl font-bold text-emerald-400">{statusCounts.clear}</p>
                  <p className="text-[10px] text-emerald-300/70">Passable</p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-xl font-bold text-amber-400">{statusCounts.warning}</p>
                  <p className="text-[10px] text-amber-300/70">Caution</p>
                </div>
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-center relative">
                  <p className="text-xl font-bold text-red-400">{statusCounts.flooded}</p>
                  <p className="text-[10px] text-red-300/70">Flooded</p>
                  {statusCounts.flooded > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                  )}
                </div>
              </div>

              {/* Action row */}
              <div className="flex gap-2">
                <button
                  onClick={onReport}
                  className="flex-1 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center gap-2 text-amber-400 text-xs font-medium active:scale-95 transition-transform"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Report Flood
                </button>
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className={`w-10 h-9 rounded-xl bg-[#162d4d] flex items-center justify-center text-[#00d4ff] active:scale-95 transition-all flex-shrink-0 ${isRefreshing ? 'opacity-50' : ''}`}
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Hotspot list */}
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">All Locations</p>
                {hotspots.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No data yet</p>
                ) : (
                  hotspots.map(hotspot => (
                    <SensorCard
                      key={hotspot.id}
                      sensor={hotspot}
                      isSelected={false}
                      onClick={() => onHotspotSelect(hotspot)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat: add Sidebar component for tablet+ layout"
```

---

### Task 4: Wire Sidebar into App.jsx and hide BottomSheet on tablet+

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/BottomSheet.jsx:128`

- [ ] **Step 1: Hide BottomSheet on tablet+**

In `src/components/BottomSheet.jsx`, find the root `<div>` at line 128:

```jsx
className="absolute left-0 right-0 bottom-0 z-[1001] glass rounded-t-3xl shadow-2xl overflow-hidden"
```

Change to:

```jsx
className="absolute left-0 right-0 bottom-0 z-[1001] glass rounded-t-3xl shadow-2xl overflow-hidden md:hidden"
```

- [ ] **Step 2: Add state and imports to App.jsx**

At the top of `src/App.jsx`, add the import after the existing imports:

```jsx
import Sidebar from './components/Sidebar';
import { useIsMobile } from './hooks/useIsMobile';
```

Inside the `App()` function, after the existing state declarations, add:

```jsx
const isMobile = useIsMobile();
const [isSidebarOpen, setIsSidebarOpen] = useState(true);
```

- [ ] **Step 3: Fix `bottomOffset` for tablet**

Find the FloodMap usage in App.jsx (around line 488):

```jsx
bottomOffset={bottomSheetHeight}
```

Change to:

```jsx
bottomOffset={isMobile ? bottomSheetHeight : 0}
```

- [ ] **Step 4: Shift map container left on tablet when sidebar is open**

Find the map container div (around line 471):

```jsx
<div className="absolute inset-0" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
```

Change to:

```jsx
<div
  className="absolute inset-0"
  style={{
    paddingTop: 'calc(4rem + env(safe-area-inset-top))',
    left: !isMobile && isSidebarOpen ? 320 : 0,
    transition: 'left 0.2s ease',
  }}
>
```

- [ ] **Step 5: Suppress floating overlays on tablet+**

Find the HotspotMiniCard render block (around line 538):

```jsx
{selectedHotspot && !routeData && !showNavigationPanel && !showDetail && (
  <HotspotMiniCard
```

Change the condition to also suppress on tablet:

```jsx
{isMobile && selectedHotspot && !routeData && !showNavigationPanel && !showDetail && (
  <HotspotMiniCard
```

Find the HotspotDetail render block (around line 547):

```jsx
{selectedHotspot && !routeData && !showNavigationPanel && showDetail && (
  <HotspotDetail
```

Change to:

```jsx
{isMobile && selectedHotspot && !routeData && !showNavigationPanel && showDetail && (
  <HotspotDetail
```

- [ ] **Step 6: Add Sidebar component render**

Find the BottomSheet render block (around line 558) and add the Sidebar just before it:

```jsx
      {/* Sidebar — tablet+ only */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(o => !o)}
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
```

- [ ] **Step 7: Verify dev build**

Run:
```bash
npm run dev
```

Expected: app loads, no console errors. On a browser window resized to ≥ 768px, the sidebar appears on the left and the BottomSheet is hidden. On < 768px, BottomSheet is visible and Sidebar is hidden.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/components/BottomSheet.jsx
git commit -m "feat: wire responsive sidebar into app layout with mobile/tablet switching"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** useIsMobile (Task 1) ✓, inline HotspotDetail (Task 2) ✓, Sidebar component (Task 3) ✓, App wiring + BottomSheet hidden (Task 4) ✓, map offset (Task 4 Step 4) ✓, suppress MiniCard/Detail overlays on tablet (Task 4 Step 5) ✓, collapse tab (Task 3 Step 1) ✓
- [x] **No placeholders:** All steps contain actual code
- [x] **Type consistency:** `onHotspotSelect(null)` used to clear selection in Sidebar matches `setSelectedHotspot(null)` in App.jsx. `inline={true}` prop matches `inline = false` default in HotspotDetail.
- [x] **Mobile unchanged:** BottomSheet, HotspotMiniCard, HotspotDetail mobile renders are untouched — only gated behind `isMobile` conditionals
