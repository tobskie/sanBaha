# Responsive Sidebar Design

**Date:** 2026-04-18  
**Status:** Approved  
**Breakpoint:** `md` (768px)

---

## Overview

The app is currently mobile-only with no responsive breakpoints. On screens ≥ 768px (iPad portrait, tablets, desktop), a fixed left sidebar replaces the BottomSheet. The map fills the remaining width. On screens < 768px, the existing mobile layout is unchanged.

---

## Architecture

### New component: `Sidebar.jsx`
- Renders only on `md+`
- Fixed left panel, `w-[320px]`, full viewport height
- Same dark glass styling as BottomSheet (`bg-[#0a1628]/90 backdrop-blur border-r border-[#00d4ff]/20`)
- Controlled by `isSidebarOpen` boolean in `App.jsx` (default: `true`)
- Collapse toggle: arrow button (`>` / `<`) on the right edge of the sidebar

### App.jsx changes
- Add `isSidebarOpen` state (default `true`)
- Pass `isSidebarOpen` and `setIsSidebarOpen` to Sidebar
- Wrap map in a div: `<div className="md:ml-[320px] md:transition-all">` when sidebar is open, `md:ml-0` when collapsed
- On `md+`, suppress `selectedHotspot` floating overlays (HotspotDetail, HotspotMiniCard) — sidebar handles them

### BottomSheet
- Add `className="md:hidden"` — hidden on tablet+
- No logic changes

### FloodMap
- Map container: `flex-1` with left margin driven by sidebar open state
- `bottomOffset` prop only used on mobile; on `md+` overlays (WeatherWidget, GPS badge) shift to `bottom-4 right-4` instead of centering above BottomSheet

### HotspotDetail
- On mobile: existing absolute overlay positioning unchanged
- On `md+`: rendered inside Sidebar, no absolute positioning, no `z-[1001]`

### HotspotMiniCard
- On mobile: existing floating overlay unchanged
- On `md+`: suppressed — tapping a marker directly populates the sidebar with HotspotDetail

---

## Sidebar Content

### Default state (no hotspot selected)
- Header: "sanBaha" logo + collapse toggle
- Flood status summary: sensor count by severity (same stats as BottomSheet collapsed view)
- Scrollable list of hotspot cards (same cards rendered in BottomSheet)

### Hotspot selected state
- Back arrow to return to list
- Full `HotspotDetail` content rendered inline (media, description, verification, navigate button)

### Navigation active state
- Navigation info panel (current step, distance, ETA) replaces the list while routing is active
- NavigationBanner stays at top of map on all devices

---

## Responsive Behavior Table

| Component | Mobile (`< md`) | Tablet+ (`≥ md`) |
|---|---|---|
| BottomSheet | unchanged (3-snap) | hidden |
| Sidebar | hidden | fixed left, collapsible |
| HotspotDetail | floating overlay | inside Sidebar |
| HotspotMiniCard | floating overlay | suppressed |
| FloodMap container | full width | `ml-[320px]` (sidebar open) / `ml-0` (collapsed) |
| WeatherWidget | bottom overlay above BottomSheet | bottom-right of map |
| GPS badge | bottom overlay above BottomSheet | bottom-right of map |
| NavigationBanner | top overlay | top overlay (unchanged) |

---

## Sidebar Collapse Behavior

- Collapsed: sidebar width → 0, map fills full width, a small `>` tab remains visible on the left edge to re-open
- Transition: `transition-all duration-200` on both sidebar width and map margin
- State persists in `App.jsx`; not persisted to localStorage (resets on reload)

---

## Data Flow

No new data fetching. Sidebar receives the same props already passed to BottomSheet:
- `hotspots` list
- `selectedHotspot` / `onSelectHotspot`
- `onNavigate`
- `isRouting`
- `navigationStep` (for nav state)

---

## Out of Scope

- Desktop-specific features (multi-column, additional panels)
- Persisting sidebar open/closed state across sessions
- Tablet-specific font scaling (Tailwind default scaling is sufficient)
- Landscape phone optimization (addressed by existing mobile layout)
