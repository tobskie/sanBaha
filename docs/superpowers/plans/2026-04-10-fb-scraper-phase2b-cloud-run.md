# FB Scraper — Phase 2B: Cloud Run Scraper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloud Run container that logs into Facebook with Playwright, searches for flood posts in Lipa City, scores them for relevance, and writes qualifying posts to `/crowd_reports` in Firebase as unverified hotspots.

**Architecture:** `flood-state-monitor` (Firebase Cloud Function, Realtime DB trigger) writes `/system/floodActive` and `/system/lastScrapeAt`. A Cloud Run container runs `scraper/src/index.js` on a 5-minute cron via Cloud Scheduler. At startup, `index.js` reads `floodActive` and `lastScrapeAt`; if `floodActive` is false and fewer than 30 minutes have elapsed, it exits immediately. Otherwise, `fbScraper.js` drives a headless Chromium browser (Playwright) to search five keywords, `confidenceScorer.js` scores each post, `locationExtractor.js` resolves coordinates, and `firebaseWriter.js` writes to `/crowd_reports` using the FB post ID as the key (idempotent).

**Tech Stack:** Node.js 20, Playwright (Chromium), firebase-admin, Google Secret Manager (`@google-cloud/secret-manager`), Vitest (scraper unit tests), Firebase Cloud Functions v2

**Spec reference:** `docs/superpowers/specs/2026-04-10-fb-scraper-community-verification-design.md`

**Prerequisite:** Phase 2A must be deployed first — the scraper writes to the same `/crowd_reports` schema Phase 2A reads.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `functions/src/floodStateMonitor.js` | Realtime DB trigger → writes `/system/floodActive` + `/system/lastScrapeAt` |
| Modify | `functions/index.js` | Export `floodStateMonitor` |
| Create | `scraper/package.json` | Scraper dependencies |
| Create | `scraper/Dockerfile` | Cloud Run container definition |
| Create | `scraper/src/locationExtractor.js` | Barangay name → coordinates lookup (pure, testable) |
| Create | `scraper/src/locationExtractor.test.js` | Unit tests |
| Create | `scraper/src/confidenceScorer.js` | Confidence scoring for a post (pure, testable) |
| Create | `scraper/src/confidenceScorer.test.js` | Unit tests |
| Create | `scraper/src/firebaseWriter.js` | Write a scored post to `/crowd_reports`, skip if key exists |
| Create | `scraper/src/fbScraper.js` | Playwright FB login + keyword search + post extraction |
| Create | `scraper/src/index.js` | Entry point: read floodActive, orchestrate scrape run |

---

## Task 1: floodStateMonitor Cloud Function

**Files:**
- Create: `functions/src/floodStateMonitor.js`
- Modify: `functions/index.js`

- [ ] **Step 1: Create floodStateMonitor.js**

Create `functions/src/floodStateMonitor.js`:

```js
// functions/src/floodStateMonitor.js
const { onValueWritten } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

exports.floodStateMonitor = onValueWritten(
  {
    ref: '/flood_sensors/{sensorId}',
    region: 'asia-southeast1',
  },
  async () => {
    const db = admin.database();
    const snapshot = await db.ref('/flood_sensors').once('value');
    const sensors = snapshot.val();

    // Derive status from waterLevel directly (same thresholds as getStatusFromWaterLevel)
    const floodActive = sensors
      ? Object.values(sensors).some(s => {
          const wl = parseFloat(s.waterLevel);
          return wl >= 25; // warning threshold — matches getStatusFromWaterLevel in mockData.js
        })
      : false;

    await db.ref('/system').update({
      floodActive,
      lastMonitoredAt: new Date().toISOString(),
    });

    logger.info('floodStateMonitor updated', { floodActive });
  }
);
```

- [ ] **Step 2: Export from functions/index.js**

In `functions/index.js`, add:

```js
const { floodStateMonitor } = require('./src/floodStateMonitor');
exports.floodStateMonitor = floodStateMonitor;
```

- [ ] **Step 3: Commit**

```bash
git add functions/src/floodStateMonitor.js functions/index.js
git commit -m "feat: add floodStateMonitor Cloud Function to track flood active state"
```

---

## Task 2: Scraper package scaffold

**Files:**
- Create: `scraper/package.json`
- Create: `scraper/Dockerfile`

- [ ] **Step 1: Create scraper/package.json**

```json
{
  "name": "sanbaha-fb-scraper",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@google-cloud/secret-manager": "^5.6.0",
    "firebase-admin": "^12.0.0",
    "playwright": "^1.44.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create scraper/Dockerfile**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

CMD ["node", "src/index.js"]
```

- [ ] **Step 3: Install scraper dependencies**

```bash
cd scraper && npm install
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add scraper/package.json scraper/Dockerfile
git commit -m "feat: scaffold Cloud Run scraper package and Dockerfile"
```

---

## Task 3: locationExtractor — barangay geocoding

**Files:**
- Create: `scraper/src/locationExtractor.js`
- Create: `scraper/src/locationExtractor.test.js`

- [ ] **Step 1: Write the failing tests**

Create `scraper/src/locationExtractor.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractLocation } from './locationExtractor.js';

describe('extractLocation', () => {
  it('detects Lodlod barangay and returns its coordinates', () => {
    const result = extractLocation('Grabe ang baha sa Lodlod bridge ngayon');
    expect(result.name).toBe('Lodlod, Lipa City');
    expect(result.coordinates[0]).toBeCloseTo(13.94, 1);
    expect(result.coordinates[1]).toBeCloseTo(121.16, 1);
    expect(result.matched).toBe(true);
  });

  it('detects Marawoy barangay', () => {
    const result = extractLocation('tubig na sa Marawoy');
    expect(result.name).toContain('Marawoy');
    expect(result.matched).toBe(true);
  });

  it('falls back to Lipa City center when no barangay found', () => {
    const result = extractLocation('baha dito sa amin');
    expect(result.name).toBe('Lipa City');
    expect(result.coordinates).toEqual([13.9411, 121.1589]);
    expect(result.matched).toBe(false);
  });

  it('is case-insensitive', () => {
    const result = extractLocation('BAHA SA LODLOD');
    expect(result.matched).toBe(true);
  });

  it('returns matched: false for empty text', () => {
    const result = extractLocation('');
    expect(result.matched).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd scraper && npx vitest run src/locationExtractor.test.js
```

Expected: FAIL — `extractLocation` not found

- [ ] **Step 3: Create scraper/src/locationExtractor.js**

```js
// scraper/src/locationExtractor.js

// Lipa City barangays with approximate centroids [lat, lng]
const BARANGAYS = [
  { name: 'Lodlod',           coords: [13.9442, 121.1623] },
  { name: 'Marawoy',          coords: [13.9380, 121.1710] },
  { name: 'Sampaguita',       coords: [13.9350, 121.1580] },
  { name: 'Mataas na Lupa',   coords: [13.9530, 121.1640] },
  { name: 'Bagong Pook',      coords: [13.9290, 121.1550] },
  { name: 'Balintawak',       coords: [13.9310, 121.1490] },
  { name: 'Banaybanay',       coords: [13.9460, 121.1760] },
  { name: 'Bolbok',           coords: [13.9200, 121.1430] },
  { name: 'Bugtong na Pulo',  coords: [13.9600, 121.1800] },
  { name: 'Dagatan',          coords: [13.9180, 121.1380] },
  { name: 'Halang',           coords: [13.9330, 121.1470] },
  { name: 'Inosloban',        coords: [13.9270, 121.1620] },
  { name: 'Kayumanggi',       coords: [13.9400, 121.1530] },
  { name: 'Lipa City',        coords: [13.9411, 121.1589] }, // city center fallback
  { name: 'Mabini',           coords: [13.9490, 121.1510] },
  { name: 'Malagonlong',      coords: [13.9360, 121.1680] },
  { name: 'Marauoy',          coords: [13.9380, 121.1710] }, // alternate spelling
  { name: 'Pinagkawitan',     coords: [13.9220, 121.1560] },
  { name: 'Plaridel',         coords: [13.9450, 121.1570] },
  { name: 'Poblacion Barangay 1', coords: [13.9411, 121.1589] },
  { name: 'Sabang',           coords: [13.9340, 121.1740] },
  { name: 'San Benito',       coords: [13.9560, 121.1720] },
  { name: 'San Carlos',       coords: [13.9470, 121.1660] },
  { name: 'San Jose',         coords: [13.9300, 121.1400] },
  { name: 'San Sebastian',    coords: [13.9420, 121.1500] },
  { name: 'Santo Niño',       coords: [13.9250, 121.1480] },
  { name: 'Sico',             coords: [13.9150, 121.1350] },
  { name: 'Tibig',            coords: [13.9490, 121.1590] },
  { name: 'Tulo',             coords: [13.9510, 121.1650] },
];

const LIPA_CENTER = { name: 'Lipa City', coordinates: [13.9411, 121.1589], matched: false };

/**
 * Scan text for a known Lipa barangay name.
 * Returns { name, coordinates, matched }.
 */
export function extractLocation(text) {
  if (!text) return LIPA_CENTER;
  const lower = text.toLowerCase();
  for (const b of BARANGAYS) {
    if (lower.includes(b.name.toLowerCase())) {
      return {
        name: `${b.name}, Lipa City`,
        coordinates: b.coords,
        matched: true,
      };
    }
  }
  return LIPA_CENTER;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd scraper && npx vitest run src/locationExtractor.test.js
```

Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add scraper/src/locationExtractor.js scraper/src/locationExtractor.test.js
git commit -m "feat: add locationExtractor for Lipa barangay geocoding"
```

---

## Task 4: confidenceScorer — post scoring

**Files:**
- Create: `scraper/src/confidenceScorer.js`
- Create: `scraper/src/confidenceScorer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `scraper/src/confidenceScorer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scorePost } from './confidenceScorer.js';

const BASE_POST = {
  text: 'baha sa lipa ngayon',
  hasMedia: false,
  locationMatched: false,
  postedAt: new Date().toISOString(),
  authorPreviouslyVerified: false,
};

describe('scorePost', () => {
  it('scores a keyword match alone at 0.30', () => {
    const score = scorePost(BASE_POST);
    expect(score).toBeCloseTo(0.30, 2);
  });

  it('adds 0.20 for media', () => {
    const score = scorePost({ ...BASE_POST, hasMedia: true });
    expect(score).toBeCloseTo(0.50, 2);
  });

  it('adds 0.25 for location match', () => {
    const score = scorePost({ ...BASE_POST, locationMatched: true });
    expect(score).toBeCloseTo(0.55, 2);
  });

  it('adds 0.15 for post within 30 minutes', () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const score = scorePost({ ...BASE_POST, postedAt: recent });
    expect(score).toBeCloseTo(0.45, 2);
  });

  it('adds 0.10 for previously verified author', () => {
    const score = scorePost({ ...BASE_POST, authorPreviouslyVerified: true });
    expect(score).toBeCloseTo(0.40, 2);
  });

  it('caps score at 1.0', () => {
    const score = scorePost({
      text: 'baha lipa',
      hasMedia: true,
      locationMatched: true,
      postedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      authorPreviouslyVerified: true,
    });
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('returns 0 when text has no flood keyword', () => {
    const score = scorePost({ ...BASE_POST, text: 'kumain na tayo' });
    expect(score).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd scraper && npx vitest run src/confidenceScorer.test.js
```

Expected: FAIL — `scorePost` not found

- [ ] **Step 3: Create scraper/src/confidenceScorer.js**

```js
// scraper/src/confidenceScorer.js

const FLOOD_KEYWORDS = ['baha', 'tubig', 'flood', 'bumabaha', 'pasig'];
const MS_30_MIN = 30 * 60 * 1000;

/**
 * Score a Facebook post for flood relevance.
 * @param {{ text: string, hasMedia: boolean, locationMatched: boolean, postedAt: string, authorPreviouslyVerified: boolean }} post
 * @returns {number} score between 0 and 1
 */
export function scorePost({ text, hasMedia, locationMatched, postedAt, authorPreviouslyVerified }) {
  const lower = (text || '').toLowerCase();
  const hasKeyword = FLOOD_KEYWORDS.some(k => lower.includes(k));
  if (!hasKeyword) return 0;

  let score = 0.30; // keyword match
  if (hasMedia) score += 0.20;
  if (locationMatched) score += 0.25;
  if (postedAt && Date.now() - new Date(postedAt).getTime() < MS_30_MIN) score += 0.15;
  if (authorPreviouslyVerified) score += 0.10;

  return Math.min(score, 1.0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd scraper && npx vitest run src/confidenceScorer.test.js
```

Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add scraper/src/confidenceScorer.js scraper/src/confidenceScorer.test.js
git commit -m "feat: add confidenceScorer for FB post flood relevance"
```

---

## Task 5: firebaseWriter — write post to /crowd_reports

**Files:**
- Create: `scraper/src/firebaseWriter.js`

- [ ] **Step 1: Create scraper/src/firebaseWriter.js**

```js
// scraper/src/firebaseWriter.js
import admin from 'firebase-admin';

const CONFIDENCE_THRESHOLD = 0.4;

/**
 * Write a scored FB post to /crowd_reports if it passes the threshold
 * and has not already been written. Uses FB post ID as the key.
 *
 * @param {object} post - { postId, text, authorName, mediaUrls, postedAt, confidence, location }
 * @param {object} locationResult - { name, coordinates, matched } from locationExtractor
 * @returns {boolean} true if written, false if skipped
 */
export async function writePost(post, locationResult) {
  if (post.confidence < CONFIDENCE_THRESHOLD) return false;

  const db = admin.database();
  const entryRef = db.ref(`crowd_reports/${post.postId}`);
  const existing = await entryRef.once('value');
  if (existing.exists()) return false; // already written — idempotent

  const severity = post.confidence >= 0.7 ? 'flooded' : 'warning';

  await entryRef.set({
    source: 'facebook',
    verified: false,
    verificationCount: 0,
    verifications: {},
    fbPostUrl: post.postUrl || '',
    fbText: (post.text || '').substring(0, 280), // cap at 280 chars
    authorName: post.authorName || 'Unknown',
    confidence: post.confidence,
    location: locationResult.name,
    coordinates: locationResult.coordinates,
    severity,
    submittedAt: new Date().toISOString(),
  });

  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add scraper/src/firebaseWriter.js
git commit -m "feat: add firebaseWriter to persist FB posts to /crowd_reports"
```

---

## Task 6: fbScraper — Playwright FB search

**Files:**
- Create: `scraper/src/fbScraper.js`

- [ ] **Step 1: Create scraper/src/fbScraper.js**

```js
// scraper/src/fbScraper.js
import { chromium } from 'playwright';

const KEYWORDS = [
  'baha lipa',
  'tubig lipa',
  'flood lipa city',
  'lipa baha',
  'baha na lipa',
];

const SCROLL_PAUSE_MS = 2000;
const MAX_POSTS_PER_KEYWORD = 20;

/**
 * Login to Facebook and search for flood posts.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<Array<{ postId, text, authorName, hasMedia, postedAt, postUrl }>>}
 */
export async function scrapeFbPosts(credentials) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 },
  });
  const page = await context.newPage();
  const posts = [];

  try {
    await login(page, credentials);

    for (const keyword of KEYWORDS) {
      const keywordPosts = await searchKeyword(page, keyword);
      posts.push(...keywordPosts);
    }
  } finally {
    await browser.close();
  }

  // Deduplicate by postId before returning
  const seen = new Set();
  return posts.filter(p => {
    if (seen.has(p.postId)) return false;
    seen.add(p.postId);
    return true;
  });
}

async function login(page, { email, password }) {
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#pass', password);
  await page.click('[name="login"]');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });

  // Check login succeeded — FB redirects away from /login on success
  if (page.url().includes('/login')) {
    throw new Error('SESSION_EXPIRED: Facebook login failed — check credentials');
  }
}

async function searchKeyword(page, keyword) {
  const url = `https://www.facebook.com/search/posts?q=${encodeURIComponent(keyword)}&filters=eyJyZWNlbnRseVBvc3RlZCI6eyJuYW1lIjoiUmVjZW50IFBvc3RzIiwiYXJncyI6IiJ9fQ%3D%3D`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(SCROLL_PAUSE_MS);

  // Scroll once to load more posts
  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(SCROLL_PAUSE_MS);

  return extractPosts(page, MAX_POSTS_PER_KEYWORD);
}

async function extractPosts(page, limit) {
  return page.evaluate((maxPosts) => {
    const results = [];
    // FB posts are in [data-pagelet] or role=article elements
    const articles = Array.from(document.querySelectorAll('[role="article"]')).slice(0, maxPosts);

    for (const article of articles) {
      // Extract post text
      const textEl = article.querySelector('[data-ad-preview="message"], [data-testid="post_message"]');
      const text = textEl?.innerText?.trim() || article.innerText?.substring(0, 500) || '';

      // Extract post link (contains post ID)
      const linkEl = article.querySelector('a[href*="/posts/"], a[href*="story_fbid"], a[href*="permalink"]');
      const postUrl = linkEl?.href || '';
      const postId = postUrl.match(/(?:story_fbid=|posts\/)(\d+)/)?.[1] || postUrl.slice(-20) || String(Date.now() + Math.random());

      // Check for media
      const hasMedia = !!(article.querySelector('img[src*="scontent"], video'));

      // Extract author name
      const authorEl = article.querySelector('a[role="link"] strong, h3 a, h2 a');
      const authorName = authorEl?.innerText?.trim() || 'Unknown';

      // Approximate post time (FB uses relative times like "2 hours ago")
      const timeEl = article.querySelector('abbr, [data-utime], a[aria-label*="ago"], span[aria-label*="ago"]');
      const postedAt = timeEl?.getAttribute('data-utime')
        ? new Date(parseInt(timeEl.getAttribute('data-utime')) * 1000).toISOString()
        : new Date().toISOString();

      if (text.length > 0 && postId) {
        results.push({ postId, text, authorName, hasMedia, postedAt, postUrl });
      }
    }
    return results;
  }, limit);
}
```

- [ ] **Step 2: Commit**

```bash
git add scraper/src/fbScraper.js
git commit -m "feat: add Playwright FB scraper for flood post extraction"
```

---

## Task 7: index.js — entry point and orchestration

**Files:**
- Create: `scraper/src/index.js`

- [ ] **Step 1: Create scraper/src/index.js**

```js
// scraper/src/index.js
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import admin from 'firebase-admin';
import { scrapeFbPosts } from './fbScraper.js';
import { scorePost } from './confidenceScorer.js';
import { extractLocation } from './locationExtractor.js';
import { writePost } from './firebaseWriter.js';

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const MS_30_MIN = 30 * 60 * 1000;

async function getSecret(secretName) {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

async function shouldScrape(db) {
  const systemSnap = await db.ref('/system').once('value');
  const system = systemSnap.val() || {};
  const floodActive = system.floodActive === true;
  const lastScrapeAt = system.lastScrapeAt ? new Date(system.lastScrapeAt).getTime() : 0;
  const elapsed = Date.now() - lastScrapeAt;

  if (floodActive) return true;
  if (elapsed >= MS_30_MIN) return true;

  console.log(`Skipping — floodActive=false and only ${Math.round(elapsed / 60000)}m since last scrape`);
  return false;
}

async function main() {
  // Initialize Firebase Admin
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  const db = admin.database();

  const run = await shouldScrape(db);
  if (!run) process.exit(0);

  // Fetch FB credentials from Secret Manager
  const email = await getSecret('FB_SCRAPER_EMAIL');
  const password = await getSecret('FB_SCRAPER_PASSWORD');

  console.log('Starting FB scrape run...');
  let rawPosts;
  try {
    rawPosts = await scrapeFbPosts({ email, password });
  } catch (err) {
    console.error('SCRAPER_ERROR:', err.message);
    process.exit(1);
  }
  console.log(`Scraped ${rawPosts.length} raw posts`);

  let written = 0;
  for (const raw of rawPosts) {
    const locationResult = extractLocation(raw.text);
    const confidence = scorePost({
      text: raw.text,
      hasMedia: raw.hasMedia,
      locationMatched: locationResult.matched,
      postedAt: raw.postedAt,
      authorPreviouslyVerified: false, // future: check /users DB
    });

    const didWrite = await writePost({ ...raw, confidence }, locationResult);
    if (didWrite) written++;
  }

  // Update lastScrapeAt
  await db.ref('/system').update({ lastScrapeAt: new Date().toISOString() });
  console.log(`Scrape complete — ${written} new posts written to /crowd_reports`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scraper/src/index.js
git commit -m "feat: add scraper entry point with floodActive check and orchestration"
```

---

## Task 8: Cloud infrastructure setup (manual steps)

These steps require GCP console access and cannot be automated. Run them once before the first deployment.

- [ ] **Step 1: Create the FB scraper secrets in Secret Manager**

```bash
# Store FB account email
echo -n "your-fb-dummy-account@gmail.com" | \
  gcloud secrets create FB_SCRAPER_EMAIL --data-file=-

# Store FB account password
echo -n "your-fb-account-password" | \
  gcloud secrets create FB_SCRAPER_PASSWORD --data-file=-
```

- [ ] **Step 2: Build and push the Docker image to Artifact Registry**

```bash
# From repo root
gcloud artifacts repositories create sanbaha-scraper \
  --repository-format=docker \
  --location=asia-southeast1

cd scraper
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/YOUR_PROJECT_ID/sanbaha-scraper/fb-scraper:latest
```

- [ ] **Step 3: Deploy to Cloud Run**

```bash
gcloud run jobs create fb-scraper-job \
  --image asia-southeast1-docker.pkg.dev/YOUR_PROJECT_ID/sanbaha-scraper/fb-scraper:latest \
  --region asia-southeast1 \
  --set-env-vars GCP_PROJECT_ID=YOUR_PROJECT_ID,FIREBASE_DATABASE_URL=https://YOUR_PROJECT.firebaseio.com \
  --service-account YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com \
  --memory 1Gi \
  --task-timeout 300
```

The service account needs roles:
- `roles/secretmanager.secretAccessor`
- `roles/firebase.admin` (or a custom role with `firebasedatabase.*`)

- [ ] **Step 4: Create Cloud Scheduler job (5-minute cron)**

```bash
gcloud scheduler jobs create http fb-scraper-cron \
  --location asia-southeast1 \
  --schedule "*/5 * * * *" \
  --uri "https://asia-southeast1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/fb-scraper-job:run" \
  --oauth-service-account-email YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com \
  --time-zone "Asia/Manila"
```

- [ ] **Step 5: Test the job manually**

```bash
gcloud run jobs execute fb-scraper-job --region asia-southeast1
```

Then check Firebase console → `/crowd_reports` for new entries with `source: "facebook"`.

- [ ] **Step 6: Commit infrastructure notes**

```bash
git add scraper/
git commit -m "docs: scraper infrastructure setup notes in plan"
```
