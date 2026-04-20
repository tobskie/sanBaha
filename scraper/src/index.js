// scraper/src/index.js
import admin from 'firebase-admin';
import { scrapeFbPosts } from './fbScraper.js';
import { scorePost } from './confidenceScorer.js';
import { extractLocation } from './locationExtractor.js';
import { writePost } from './firebaseWriter.js';

const MS_30_MIN = 30 * 60 * 1000;

function initFirebase() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is required');
  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
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

const GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Decide whether /system/floodActive should change based on this run's signals.
 * Pure function — no I/O. Caller supplies current state + collected inputs.
 *
 * @param {object} input
 * @param {number} input.floodedPostsThisRun     count of newly-written posts with severity='flooded'
 * @param {number} input.uniqueAuthorsThisRun    distinct authors across those flooded posts
 * @param {boolean} input.anySensorFlooded       true if any sensor's status is 'flooded'
 * @param {boolean} input.currentlyActive        value of /system/floodActive before this run
 * @param {number|null} input.floodActiveSetAtMs ms epoch of last ON refresh, or null
 * @param {number} input.nowMs                   current time in ms
 * @returns {{ action: 'on'|'off'|'none', reason: string }}
 */
export function evaluateFloodActive(input) {
  const {
    floodedPostsThisRun,
    uniqueAuthorsThisRun,
    anySensorFlooded,
    currentlyActive,
    floodActiveSetAtMs,
    nowMs,
  } = input;

  const twoAuthorsRule  = uniqueAuthorsThisRun >= 2;
  const postPlusSensor  = floodedPostsThisRun >= 1 && anySensorFlooded;
  const onRuleFired     = twoAuthorsRule || postPlusSensor;

  if (onRuleFired) {
    const reason = twoAuthorsRule ? '2+ authors' : '1 post + sensor flooded';
    return { action: 'on', reason };
  }

  if (currentlyActive) {
    const age = floodActiveSetAtMs ? nowMs - floodActiveSetAtMs : Infinity;
    if (age >= GRACE_MS) {
      return { action: 'off', reason: `expired (ageMin=${Math.round(age / 60000)})` };
    }
    return { action: 'none', reason: `grace (ageMin=${Math.round(age / 60000)})` };
  }

  return { action: 'none', reason: 'below threshold' };
}

async function main() {
  initFirebase();
  const db = admin.database();

  const run = await shouldScrape(db);
  if (!run) process.exit(0);

  const cookieString = process.env.FB_COOKIES;
  if (!cookieString) throw new Error('FB_COOKIES env var is required (see scraper/README for cookie export steps)');

  console.log('Starting FB scrape run...');
  let rawPosts;
  try {
    rawPosts = await scrapeFbPosts({ cookieString });
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
      authorPreviouslyVerified: false,
    });

    const didWrite = await writePost({ ...raw, confidence }, locationResult);
    if (didWrite) written++;
  }

  await db.ref('/system').update({ lastScrapeAt: new Date().toISOString() });
  console.log(`Scrape complete — ${written} new posts written to /crowd_reports`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
