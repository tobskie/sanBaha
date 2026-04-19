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

async function main() {
  initFirebase();
  const db = admin.database();

  const run = await shouldScrape(db);
  if (!run) process.exit(0);

  const email = process.env.FB_EMAIL;
  const password = process.env.FB_PASSWORD;
  if (!email || !password) throw new Error('FB_EMAIL and FB_PASSWORD env vars are required');

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
