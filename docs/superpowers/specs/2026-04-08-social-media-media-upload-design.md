# sanBaha — Social Media Integration & Media Upload Design

**Date:** 2026-04-08  
**Status:** Approved  
**Scope:** Two new capabilities added to the existing sanBaha flood monitoring platform — (1) automated Facebook post ingestion for flood intelligence, and (2) citizen photo/video uploads attached to crowd reports.

---

## 1. System Architecture Overview

All components run inside the existing Firebase stack. No new infrastructure services are introduced.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│                                                                 │
│  [ESP32 Sensor]   [Citizen App Upload]   [Facebook Graph API]   │
│       │                   │                       │             │
└───────┼───────────────────┼───────────────────────┼─────────────┘
        │                   │                       │
        ▼                   ▼                       ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│ /flood_sensors│  │ Firebase Storage │  │  Cloud Function      │
│  (existing)   │  │  /uploads/{id}  │  │  fb-scraper (cron)   │
└───────┬───────┘  └────────┬────────┘  └──────────┬───────────┘
        │                   │                       │
        │           metadata│written to DB          │writes to DB
        │                   ▼                       ▼
        │          ┌──────────────────────────────────────┐
        └─────────►│       Firebase Realtime Database      │
                   │                                      │
                   │  /flood_sensors   (existing)         │
                   │  /crowd_reports   (existing)         │
                   │  /media_uploads   (new)              │
                   │  /social_intake   (new)              │
                   └──────────────────┬───────────────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                   ▼
           ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
           │  sanBaha App │  │  sanBaha App │  │  /admin route │
           │  (citizen)   │  │  (operator)  │  │  web dashboard│
           │              │  │  badge+tray  │  │  full triage  │
           └──────────────┘  └──────────────┘  └───────────────┘
```

### Firebase Database Nodes

| Node | Purpose | Writer | Reader |
|------|---------|--------|--------|
| `/flood_sensors` | Hardware sensor data | ESP32 | App, routing engine |
| `/crowd_reports` | Citizen text reports | App (existing) | App, admin |
| `/media_uploads` | Upload metadata + Storage URLs | App (new) | App, admin |
| `/social_intake` | Facebook post candidates | `fb-scraper` Cloud Function | Admin only |

### New Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `fb-scraper` | Pub/Sub cron | Queries Facebook Graph API, writes to `/social_intake` |
| `flood-state-monitor` | Realtime DB trigger on `/flood_sensors` | Sets `/system/floodActive` flag |
| `process-media` | Firebase Storage `object.finalized` | Generates thumbnails and video frame |
| `retention-cleanup` | Pub/Sub cron (nightly) | Deletes expired DB nodes and Storage objects |

---

## 2. Social Media Ingestion Pipeline

### Facebook Graph API Setup

- **App permissions required:** `pages_read_engagement`, `pages_search` (public content)
- **App Review lead time:** 2–4 weeks — apply before development starts
- **Development mode:** Scraper runs against a test Facebook Page controlled by the team until approval

### `fb-scraper` Cloud Function

**Runtime:** Firebase Cloud Functions 2nd gen, Node.js  
**Schedule:** Controlled by `/system/floodActive` flag

- `floodActive: true` → runs every **5 minutes** via Pub/Sub cron
- `floodActive: false` → runs every **30 minutes**

**Search parameters per run:**

```js
keywords: ["baha", "flood", "tubig", "pasig", "lipa baha", "LipaFlood"]
locationBbox: { minLat: 13.85, maxLat: 14.05, minLng: 121.08, maxLng: 121.22 }
timeWindow: last 35 minutes  // overlaps previous run to catch late-indexed posts
```

### `flood-state-monitor` Cloud Function

Triggered by any write to `/flood_sensors`. Reads all sensor statuses. If any sensor is `flooded` or `warning`, writes `/system/floodActive: true`. If all sensors are `clear`, writes `false`. The `fb-scraper` reads this flag at startup to determine its polling interval.

### Confidence Scoring

Computed before writing to `/social_intake`. Posts scoring below **0.3 are dropped** and never written.

| Signal | Weight |
|--------|--------|
| Contains flood keyword | +0.30 |
| Has attached photo or video | +0.20 |
| Location tag within Lipa bounding box | +0.25 |
| Posted within last 30 minutes | +0.15 |
| Author has submitted accepted reports before | +0.10 |

- Score ≥ 0.6 → `priority: "high"` — sorted to top of operator queue
- Score 0.3–0.59 → `priority: "normal"` — shown with low-confidence label
- Score < 0.3 → dropped, not written

### Deduplication

The Facebook `post.id` is used as the Firebase key under `/social_intake`. The Cloud Function checks if the key already exists before writing. Duplicate runs produce no writes — idempotent by design.

### `/social_intake/{postId}` Schema

```json
{
  "postId": "facebook_post_id",
  "sourceUrl": "https://facebook.com/...",
  "authorName": "Juan dela Cruz",
  "authorId": "fb_user_id",
  "text": "Grabe ang baha sa Lodlod bridge ngayon...",
  "mediaUrls": ["https://...jpg"],
  "detectedLocation": "Lodlod, Lipa City",
  "coordinates": [13.9411, 121.1636],
  "postedAt": "2026-04-08T14:32:00Z",
  "ingestedAt": "2026-04-08T14:35:00Z",
  "status": "pending",
  "priority": "high",
  "confidence": 0.82
}
```

### Verification Model

Every post starts with `status: "pending"`. No automated acceptance. An operator must explicitly set `status` to `"accepted"` or `"rejected"`.

On acceptance:
- A new entry is written to `/crowd_reports` with `type: "social"` and `verified: true`
- The operator may edit coordinates before accepting
- The Facebook post's author name and text are **not** copied to the public-facing crowd report — only location and severity

On rejection:
- `status: "rejected"` is written
- Item is retained for 30 days for audit, then deleted by `retention-cleanup`
- Never shown on the public map

---

## 3. Media Upload Pipeline

### Citizen Upload Flow

The existing `ReportFloodPanel` gains an optional media attachment step:

1. User fills report (location, severity, description) — **existing**
2. Optional: tap camera icon → pick from gallery or capture live
3. Tap Submit → report text saves to `/crowd_reports` immediately (fast path, works on poor connectivity)
4. Map hotspot appears immediately
5. Media uploads to Firebase Storage in background
6. On success → `/media_uploads/{reportId}` created with Storage metadata and URLs
7. On failure → saved to `localStorage` retry queue; retried on next app open or network reconnect

### File Constraints

| Type | Accepted Formats | Max Size | Client Processing |
|------|-----------------|----------|------------------|
| Photo | JPG, PNG, WEBP, HEIC | 10 MB | Resize to 2048px max; HEIC converted to JPEG before upload |
| Video | MP4, MOV | 50 MB | None — uploaded as-is |

HEIC conversion uses a lightweight client-side JS library to prevent broken previews on Android and desktop browsers.

### Firebase Storage Structure

```
/uploads/
  {reportId}/
    original.jpg          ← full-res original (or .mp4 for video)
    thumb_400.jpg         ← 400px thumbnail (generated by process-media)
    video.mp4             ← original video (if submitted)
    thumb_video.jpg       ← first-frame thumbnail (generated by process-media)
```

Each folder is keyed to the `reportId` from `/crowd_reports` — media and report are always linked by the same ID. Re-submitting media for the same report replaces existing files.

### `process-media` Cloud Function

Triggered by `Storage object.finalized`. Runs after each upload completes.

- **Images:** Generates `thumb_400.jpg` using Sharp
- **Videos:** Extracts first frame using FFmpeg (via Cloud Functions community layer), saves as `thumb_video.jpg`
- Writes `processingStatus: "complete"` to `/media_uploads/{reportId}` when done

The admin dashboard displays thumbnails only — operators do not stream full-resolution files during triage.

### `/media_uploads/{reportId}` Schema

```json
{
  "reportId": "crowd_reports_key",
  "uploaderId": "firebase_uid",
  "uploaderName": "Maria Santos",
  "type": "photo",
  "originalPath": "uploads/{reportId}/original.jpg",
  "thumbPath": "uploads/{reportId}/thumb_400.jpg",
  "storageBucket": "sanbaha-e05ae.appspot.com",
  "fileSize": 1843200,
  "coordinates": [13.9411, 121.1636],
  "capturedAt": "2026-04-08T14:30:00Z",
  "uploadedAt": "2026-04-08T14:31:12Z",
  "processingStatus": "complete"
}
```

### localStorage Retry Queue

Failed uploads are stored under key `sanbaha_upload_queue` as:

```json
[
  {
    "reportId": "abc123",
    "fileBlobBase64": "...",
    "retryCount": 2,
    "lastAttempt": "2026-04-08T14:35:00Z"
  }
]
```

Retry triggers: app launch, network `online` event. Maximum 5 attempts per item. After 5 failures, the item is cleared and the user is shown a notification that the media could not be attached. The text report remains on the map regardless.

### Firebase Storage Security Rules

```
match /uploads/{reportId}/{file} {
  allow write: if request.auth != null;
  allow read: if request.auth != null;
}
```

Raw Storage URLs are never exposed to the client. The admin dashboard uses server-generated signed URLs (1-hour expiry) to display media.

---

## 4. Operator Review Interface

### Mobile App — Badge & Triage Panel

The `MobileHeader` component subscribes to a count derived from:
- `/social_intake` nodes with `status: "pending"`
- `/crowd_reports` nodes with `mediaVerified` absent (unreviewed uploads)

A numeric badge appears on the menu icon when the count is > 0.

The mobile menu gains a **"Review Queue"** item at the top. Tapping it opens a panel with a vertical card list. Each card shows:

- Source icon (Facebook logo or camera icon)
- Thumbnail image
- Truncated text (post content or report description)
- Time ago + location name
- **Accept** (green) and **Reject** (red) action buttons

**Accept behaviour (social post):** Promotes to `/crowd_reports` with `type: "social"`, `verified: true`. Hotspot appears on map immediately.  
**Accept behaviour (media upload):** Sets `crowd_reports/{id}/mediaVerified: true`.  
**Reject:** Sets `status: "rejected"`. Removed from queue. Retained in DB for audit.

The mobile flow has no editing — field operators need speed, not precision. Location correction is a desktop-only action.

### Web Admin Dashboard — `/admin` Route

Protected by role check: `user.role === "admin"` (stored at `/users/{uid}/role`).

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  sanBaha Admin         [Active Flood: YES]    Juan dela Cruz │
├──────────────┬──────────────────────────────────────────────┤
│              │  INTAKE QUEUE                   [3 pending]  │
│  LIVE MAP    │ ┌────────────────────────────────────────┐   │
│              │ │ [FB] Grabe ang baha sa Lodlod...  0.82 │   │
│  (minimap    │ │ 📍 Lodlod · 14 mins ago  [Accept][Rej] │   │
│   with all   │ ├────────────────────────────────────────┤   │
│   hotspots)  │ │ [📷] Photo report · Maria Santos       │   │
│              │ │ 📍 Brgy. Marawoy · 6 mins ago [A][R]   │   │
│              │ ├────────────────────────────────────────┤   │
│              │ │ [FB] Tubig na sa Ayala Malls area 0.71 │   │
│              │ │ 📍 Downtown · 2 mins ago  [Accept][Rej]│   │
│              │ └────────────────────────────────────────┘   │
│              │                                              │
│              │  ACCEPTED REPORTS              [12 today]   │
│              │  [sortable table with map-click interaction] │
└──────────────┴──────────────────────────────────────────────┘
```

**Detail drawer** (opens on item click):

- **Social post:** Full post text, all attached images (signed URLs), author info, confidence score breakdown, link to original Facebook post, editable location field
- **Media upload:** Full-res photo or video player (signed URLs), report text, GPS coordinates on mini-map, uploader name, editable location field

Operators can edit coordinates before accepting. The corrected coordinates are written to the resulting `/crowd_reports` entry.

### Role System

Two roles stored at `/users/{uid}/role`:

| Role | Permissions |
|------|-------------|
| `citizen` | Submit reports, upload media (default for all Google auth users) |
| `admin` | All citizen permissions + `/admin` route access, accept/reject queue |

Initial admins are set manually in Firebase console. No self-service admin promotion.

---

## 5. Privacy, Data Retention & Data Quality

### Privacy

- Media uploads are never publicly accessible. All Storage URLs require authentication.
- Citizens see a one-time consent notice before their first upload. Consent is stored at `/users/{uid}/mediaConsentGiven: true`. The upload button is disabled until consent is recorded.
- Accepted social posts shown on the public map display only location and a generic label (e.g., *"Community report — Lodlod Bridge"*). The Facebook author's name and post text are never displayed publicly.
- Rejected social posts are retained for 30 days for audit purposes, then deleted.

**Consent notice text:**
> *"Your photo/video, name, and location will be stored by sanBaha and visible to authorized emergency responders. It will not be shared publicly."*

### Data Retention Schedule

| Data type | Retention | Mechanism |
|-----------|-----------|-----------|
| Sensor readings (`/flood_sensors`) | Live only — overwritten by hardware | ESP32 push |
| Crowd reports (`/crowd_reports`) | 90 days | `retention-cleanup` nightly |
| Media files (Firebase Storage) | 90 days | `retention-cleanup` deletes Storage objects |
| Social intake — rejected | 30 days | `retention-cleanup` nightly |
| Social intake — accepted | 90 days (same as crowd reports) | `retention-cleanup` nightly |
| User consent flags (`/users`) | Indefinite | Manual deletion on request only |

### Duplicate Prevention

Three independent layers:

1. **Social posts:** Facebook `post.id` used as Firebase key — structural deduplication, idempotent writes
2. **Crowd reports:** On submission, app checks `/crowd_reports` for entries within 100 metres and 10 minutes. Near-duplicates are flagged `possibleDuplicate: true` in DB; user sees a confirmation prompt before proceeding
3. **Media uploads:** Upload folder keyed to `reportId` — one media folder per report; re-submission replaces existing files

### Data Quality

- Posts below confidence 0.3 are never written to DB
- Posts 0.3–0.59 surface at the bottom of the queue with a low-confidence label
- All accepted social posts receive `verified: true` on their `/crowd_reports` entry
- The map visually distinguishes verified reports (accepted by operator) from unverified citizen-submitted reports

---

## 6. Build Phases

These two subsystems are independent and can be built in parallel or sequentially.

**Phase 1 — Media Uploads** (no external API approval required, ships first):
- `ReportFloodPanel` media attachment UI
- Firebase Storage integration
- `process-media` Cloud Function
- `/media_uploads` DB node
- `localStorage` retry queue
- Admin mobile triage panel (media cards only)
- Admin web dashboard (media review only)

**Phase 2 — Social Media Ingestion** (requires Facebook App Review approval):
- `flood-state-monitor` Cloud Function
- `fb-scraper` Cloud Function
- `/social_intake` DB node + confidence scoring
- Admin queue extended with social post cards
- Apply for Facebook App Review at project start — runs in parallel with Phase 1 development

**Phase 3 — Role System** (prerequisite for both phases but can be built first):
- `/users/{uid}/role` DB node
- Admin route protection
- Role assignment via Firebase console
