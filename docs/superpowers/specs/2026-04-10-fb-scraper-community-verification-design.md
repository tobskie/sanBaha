# sanBaha — FB Scraper & Community Verification Design

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Automated Facebook post scraping for flood intelligence in Lipa City, with direct map posting and community-driven verification (no admin approval gate).

---

## 1. System Architecture Overview

```
[Cloud Run Container]              [Firebase Realtime DB]          [sanBaha App]
  Node.js + Playwright        →    /crowd_reports                →  Map hotspot
  Cron: 5min (flood active)        source: "facebook"               (amber, unverified)
        30min (flood clear)        verified: false                      ↓
  Keywords: baha lipa,             verificationCount: 0            user taps Verify
            tubig lipa,            verifications: {}               writes verifications/{uid}
            flood lipa city        fbPostUrl, fbText               increments count
            lipa baha,             confidence                      at 3 → verified: true
            baha na lipa           coordinates, severity
```

The scraper writes FB posts **directly to `/crowd_reports`** — the same node the map already reads. No admin queue. No approval gate. Unverified FB hotspots appear on the map immediately with distinct visual treatment. Three unique user verifications flip a hotspot to verified.

The `flood-state-monitor` Cloud Function (which sets `/system/floodActive`) controls scrape frequency — built as part of Phase 2B below.

---

## 2. Scraper — Cloud Run Container

**Runtime:** Node.js 20 + Playwright (Chromium headless)
**Deploy target:** Google Cloud Run
**Why Cloud Run, not Cloud Functions:** Playwright requires a full browser — Cloud Functions time out and have no headless browser support. Cloud Run containers have no timeout ceiling for this use case.

### Credentials

A dedicated dummy Facebook account is used exclusively for scraping. Credentials are stored in **Google Secret Manager** — never in code or environment files. The container fetches them at startup via the Secret Manager API.

### Cron Schedule

Controlled by `/system/floodActive` in Firebase Realtime DB (written by the existing `flood-state-monitor` Cloud Function):

| `floodActive` | Scrape interval |
|---------------|-----------------|
| `true`        | Every 5 minutes |
| `false`       | Every 30 minutes |

Cloud Scheduler triggers the Cloud Run job every 5 minutes. At startup, the container reads `/system/floodActive` from Firebase. If `false`, it checks whether 30 minutes have elapsed since the last successful scrape (tracked in `/system/lastScrapeAt`). If not, it exits immediately without scraping. This gives a single job that naturally runs at 5-min or 30-min cadence based on flood state.

### Search Strategy

Per run, the scraper iterates over these keywords in sequence:

```js
const KEYWORDS = [
  "baha lipa",
  "tubig lipa",
  "flood lipa city",
  "lipa baha",
  "baha na lipa"
];
```

For each keyword:
1. Navigate to `facebook.com/search/posts?q={keyword}`
2. Filter to **Recent** posts
3. Collect posts from the last **35 minutes** (overlaps the previous run to catch late-indexed posts)
4. Extract: post ID, text, author name, attached media URLs, location tag, timestamp

### Confidence Scoring

Computed for each post before writing. Posts below **0.4 are dropped** and never written to Firebase.

| Signal | Weight |
|--------|--------|
| Contains flood keyword in text | +0.30 |
| Has attached photo or video | +0.20 |
| Location mention matches Lipa barangay name | +0.25 |
| Posted within last 30 minutes | +0.15 |
| Author UID previously verified by community | +0.10 |

- Score ≥ 0.4 → written to `/crowd_reports` as unverified hotspot
- Score < 0.4 → dropped, never written

The threshold is 0.4 (lower than the original spec's 0.6) because community verification acts as the quality gate instead of admin review.

### Deduplication

Facebook's `post.id` is used as the Firebase key under `/crowd_reports`. The scraper checks if the key already exists before writing. Duplicate runs produce no writes — idempotent by design.

### Location Extraction

1. Check for FB location tag on the post — use directly if present and within Lipa bounding box (`minLat: 13.85, maxLat: 14.05, minLng: 121.08, maxLng: 121.22`)
2. Scan post text for known Lipa barangay names (Lodlod, Marawoy, Sampaguita, Mataas na Lupa, etc.) — geocode to centroid if matched
3. If neither: default to Lipa City center `[13.9411, 121.1636]` with a confidence penalty that will likely drop the post below 0.4

### Failure Handling

- Playwright load error / network timeout → log `SCRAPER_ERROR` to Cloud Logging, skip run, retry on next cron tick
- FB login session expired → log `SESSION_EXPIRED`, skip run. Operator re-authenticates by redeploying the container (forces fresh login)
- FB account blocked → log `SCRAPER_BLOCKED`. No app-side impact — existing hotspots remain on map. Fix: swap credentials in Secret Manager and redeploy

---

## 3. Data Model

### `/crowd_reports/{postId}` — FB-sourced entry

```json
{
  "source": "facebook",
  "verified": false,
  "verificationCount": 0,
  "verifications": {
    "uid_abc123": true,
    "uid_def456": true
  },
  "fbPostUrl": "https://facebook.com/permalink/...",
  "fbText": "Grabe ang baha sa Lodlod ngayon hindi na makadaan ang mga sasakyan",
  "authorName": "Juan dela Cruz",
  "confidence": 0.72,
  "location": "Lodlod, Lipa City",
  "coordinates": [13.9411, 121.1636],
  "severity": "flooded",
  "submittedAt": "2026-04-10T14:35:00Z"
}
```

### Existing citizen reports

Retain their current schema. Get `source: "citizen"` and `verified: true` added on write (citizen-submitted reports are trusted by default — no verification step).

### Firebase Security Rules additions

```json
"crowd_reports": {
  "$postId": {
    "verifications": {
      "$uid": {
        ".write": "auth !== null && auth.uid === $uid && !data.exists()"
      }
    },
    "verificationCount": {
      ".write": "auth !== null"
    },
    "verified": {
      ".write": "auth !== null"
    }
  }
}
```

The `!data.exists()` check on `verifications/$uid` prevents a user from writing a second verification — one UID, one vote, enforced at the database layer.

---

## 4. App UI Changes

### Map Hotspot Visual Treatment

| State | Color | Badge | Animation |
|-------|-------|-------|-----------|
| Unverified (FB, 0–2 verifications) | Amber/yellow | "?" | Pulsing |
| Verified (FB, 3+ verifications) | Standard red/orange | None | None |
| Citizen report (existing) | Standard red/orange | None | None |

### HotspotDetail Panel — Unverified FB Report

```
┌─────────────────────────────────────┐
│ ⚠ Unverified Report                 │
│ Sourced from Facebook               │
│                                     │
│ "Grabe ang baha sa Lodlod ngayon    │
│  hindi na makadaan ang mga sasakyan"│
│                       — Juan dela C.│
│                                     │
│ 📍 Lodlod, Lipa City  · 14 mins ago │
│ ✓ 1 of 3 verifications needed       │
│                                     │
│ [     Have you seen this flood?    ]│
│ [         Verify Report            ]│
└─────────────────────────────────────┘
```

- **Verify button:** Calls `requireAuth` (existing). On tap, writes `verifications/{uid}: true` and increments `verificationCount` via Firebase transaction
- **After verifying:** Button changes to "✓ You verified this" — disabled, no further action
- **At 3 verifications:** Panel no longer shows verify button. Hotspot marker updates to verified style. Label reads "Verified Flood Area"
- **Duplicate vote prevention:** UI reads `verifications/{currentUser.uid}` on panel open — if it exists, button is already shown as verified

### Toast Notification

When a new FB-sourced entry appears in `/crowd_reports` (detected via the existing real-time subscription), a toast fires:

> *"New unverified flood report near [location] — tap to verify"*

Uses the existing `Toast` component with `type: "info"`.

---

## 5. Verification Flow

```
User taps hotspot
       ↓
requireAuth() — prompts login if not authenticated
       ↓
Read verifications/{uid} — already verified?
  YES → show "✓ You verified this" (disabled)
  NO  → show "Verify Report" button
       ↓
User taps Verify
       ↓
Firebase transaction:
  1. Write verifications/{uid}: true
  2. Increment verificationCount
  3. If verificationCount >= 3 → set verified: true
       ↓
UI updates optimistically
```

The increment and verified flag are set in a single Firebase transaction to prevent race conditions when multiple users verify simultaneously.

---

## 6. Edge Cases & Cleanup

### Stale Unverified Hotspots

Handled by the existing `retention-cleanup` Cloud Function (nightly). New rules added:

| Condition | Action |
|-----------|--------|
| `source: "facebook"`, `verificationCount: 0`, older than 6 hours | Delete |
| `source: "facebook"`, `verificationCount: 1–2`, older than 24 hours | Delete |
| `source: "facebook"`, `verified: true` | Retain for standard 90-day window |

### Coordinates Missing / Low Confidence

Posts where location can't be extracted default to Lipa City center with a confidence penalty that typically drops them below the 0.4 threshold — they are dropped and never written.

### FB Account Blocked

No app-side impact. The map continues to show existing hotspots. New FB hotspots stop arriving. Fix: update credentials in Secret Manager and redeploy the Cloud Run container. No code change required.

---

## 7. Build Phases

This feature builds on top of the completed Phase 1 (media uploads).

**Phase 2A — Data model + app verification UI** (no scraper needed to test):
- Add `source`, `verified`, `verificationCount`, `verifications` fields to `/crowd_reports` writes
- Update Firebase Security Rules
- Update map hotspot visual treatment (amber color, "?" badge, pulse)
- Build HotspotDetail verify button + transaction logic
- Toast notification for new FB hotspots
- Update `retention-cleanup` with new stale-hotspot rules

**Phase 2B — Cloud Run scraper**:
- Build `flood-state-monitor` Cloud Function (Realtime DB trigger on `/flood_sensors`, writes `/system/floodActive` and `/system/lastScrapeAt`)
- Scaffold Cloud Run container (Node.js + Playwright)
- Implement FB login + search + confidence scoring
- Connect to Firebase — write to `/crowd_reports`
- Set up Google Cloud Scheduler cron (every 5 min)
- Configure Secret Manager for FB credentials
- Implement startup logic: read `floodActive` + `lastScrapeAt`, exit early if 30-min cadence not yet elapsed
