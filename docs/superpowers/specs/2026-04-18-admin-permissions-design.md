# Admin Permissions Design

**Date:** 2026-04-18  
**Status:** Approved  
**Role model:** Single `admin` role — all permissions granted together

---

## Overview

The existing binary `role: 'admin'` / `'citizen'` system is kept as-is. What changes is the feature set available to admins: a multi-page admin interface replaces the current single `AdminDashboard.jsx`, and Firebase rules are updated to permit admin writes on previously read-only or public nodes.

---

## Architecture

A shared `AdminLayout.jsx` wraps all admin pages. It renders a left sidebar (`AdminNav.jsx`) with links to every section and a content area for the current page. All routes are nested under `/admin/*` in `App.jsx` and gated by `isAdmin` from `AdminContext`.

The existing `AdminDashboard.jsx` (media review) is renamed/refactored into `AdminMedia.jsx` and moved to `/admin/media`. The `/admin` root redirects to `/admin/reports`.

---

## Pages

### `/admin/reports` — `AdminReports.jsx`
- Real-time list of **all** crowd reports (verified and unverified, including `status: 'clear'` which are filtered from the public map)
- Per-report actions:
  - **Verify** — sets `crowd_reports/{id}/verified: true` and `verifications/{id}/verified: true`, bypassing the 3-vote requirement
  - **Delete** — removes `crowd_reports/{id}` and its associated `verifications/{id}` and `media_uploads/{id}`
- Filter bar: All / Unverified / Verified / Flooded / Warning

### `/admin/sensors` — `AdminSensors.jsx`
- Real-time list of all sensors from `flood_sensors`
- Per-sensor inline edit: name, latitude, longitude, waterLevel
- Add new sensor (writes a new key to `flood_sensors`)
- Delete sensor
- Changes write directly to `flood_sensors/{id}`

### `/admin/users` — `AdminUsers.jsx`
- Paginated/searchable list of all entries under `users/`
- Displays: uid, displayName (if stored), email (if stored), current role
- Toggle admin role: sets `users/{uid}/role` to `'admin'` or `'citizen'`
- Cannot revoke own admin role (guarded client + rules)

### `/admin/alerts` — `AdminAlerts.jsx`
- Compose and publish a city-wide alert:
  - Message text (max 200 chars)
  - Severity: `info` | `warning` | `critical`
  - Optional expiry time (defaults to 24 h)
- Published alert written to `alerts/{pushId}` with fields: `message`, `severity`, `createdAt`, `expiresAt`, `createdBy`
- List of active alerts with a **Expire now** button (sets `expiresAt` to now)
- Public-facing: `FloodMap.jsx` subscribes to `alerts/` and surfaces active alerts as a banner

### `/admin/logs` — `AdminLogs.jsx`
- Read-only viewer for the `logs/` node
- Displays: timestamp, event type, actor uid, details
- Filter by event type; newest-first sort
- No write capability

### `/admin/media` — `AdminMedia.jsx` *(refactored from AdminDashboard.jsx)*
- Existing media review flow moved here unchanged
- Pending and reviewed tabs

---

## Shared Components

### `AdminLayout.jsx`
- Renders sidebar (`AdminNav.jsx`) + `<Outlet />` for nested routes
- Guards: if `!isAdmin` → redirect to `/`; if `!user` → redirect to `/`

### `AdminNav.jsx`
- Vertical nav links: Reports, Sensors, Users, Alerts, Logs, Media
- Active link highlight
- Back to app link at bottom

---

## Firebase Rule Changes

```json
{
  "rules": {
    "flood_sensors": {
      ".read": true,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "crowd_reports": {
      ".read": true,
      "$id": {
        ".write": "!data.exists() || (auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin')",
        "verified": {
          ".write": "auth != null"
        }
      }
    },
    "verifications": {
      ".read": true,
      ".write": "auth != null"
    },
    "media_uploads": {
      ".read": true,
      ".write": "auth != null"
    },
    "social_intake": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": false
    },
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'"
      }
    },
    "system": {
      ".read": true,
      ".write": false
    },
    "logs": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": false
    },
    "alerts": {
      ".read": true,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
    }
  }
}
```

---

## Data Shapes

### `alerts/{pushId}`
```json
{
  "message": "Flooding reported along Ayala Highway. Avoid area.",
  "severity": "critical",
  "createdAt": "2026-04-18T12:00:00.000Z",
  "expiresAt": "2026-04-19T12:00:00.000Z",
  "createdBy": "uid-of-admin"
}
```

---

## Public-Facing Alert Banner

`FloodMap.jsx` gains a `subscribeToAlerts()` subscription (defined in `firebase.js`). Active alerts (where `expiresAt > now`) are passed up to `App.jsx` and rendered as a dismissible banner above the map, below the `NavigationBanner`. Severity drives banner color: `info` → blue, `warning` → amber, `critical` → red.

---

## Out of Scope

- Push notifications (Firebase Cloud Messaging)
- Multi-role / granular per-user permission flags
- Audit trail for admin actions (beyond existing `logs/` node)
- Admin user creation (handled via Firebase Console)
