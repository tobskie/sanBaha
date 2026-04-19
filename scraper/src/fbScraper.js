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
  // Base64-encoded filter for "Recent Posts" — keeps results fresh
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
    // FB posts are in role=article elements
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
