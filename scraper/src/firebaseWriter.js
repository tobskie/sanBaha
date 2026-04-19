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
