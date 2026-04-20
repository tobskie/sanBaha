// scraper/src/confidenceScorer.js

const FLOOD_KEYWORDS = ['baha', 'flood', 'bumabaha'];
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
