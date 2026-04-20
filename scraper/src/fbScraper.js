// scraper/src/fbScraper.js
import { chromium } from 'playwright';

// Public FB groups/pages to scrape. Search endpoint is blocked from datacenter IPs,
// so we visit group feeds directly and let the confidence scorer filter flood posts.
const SOURCES = [
  'https://www.facebook.com/groups/lipacitynews/',
];

const SCROLL_PAUSE_MS = 2500;
const SCROLL_PASSES = 3;
const MAX_POSTS_PER_SOURCE = 30;

/**
 * Scrape FB posts using a pre-authenticated session cookie string.
 * @param {{ cookieString: string }} auth — raw Cookie header: "c_user=...; xs=...; datr=...; sb=..."
 * @returns {Promise<Array<{ postId, text, authorName, hasMedia, postedAt, postUrl }>>}
 */
export async function scrapeFbPosts({ cookieString }) {
  if (!cookieString || !cookieString.includes('c_user=') || !cookieString.includes('xs=')) {
    throw new Error('SESSION_MISSING: FB_COOKIES secret must contain c_user and xs cookies');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });
  await context.addCookies(parseCookies(cookieString));

  const page = await context.newPage();
  const posts = [];

  try {
    // Confirm session is valid before hitting target pages
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const url = page.url();
    const title = await page.title();
    console.log(`session check: url=${url} title=${title}`);
    if (url.includes('/login') || url.includes('/checkpoint')) {
      throw new Error(`SESSION_EXPIRED: cookies rejected (${url}) — re-export from your browser`);
    }

    for (const sourceUrl of SOURCES) {
      const sourcePosts = await scrapeSource(page, sourceUrl);
      posts.push(...sourcePosts);
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

// Parse "name=value; name=value" cookie header into Playwright cookie objects
// scoped to .facebook.com.
function parseCookies(cookieString) {
  return cookieString
    .split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map(pair => {
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      return {
        name,
        value,
        domain: '.facebook.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      };
    });
}

async function scrapeSource(page, sourceUrl) {
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(SCROLL_PAUSE_MS);

  // Scroll multiple times to load more posts — group feeds lazy-load
  for (let i = 0; i < SCROLL_PASSES; i++) {
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(SCROLL_PAUSE_MS);
  }

  const diag = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    articleCount: document.querySelectorAll('[role="article"]').length,
    feedCount: document.querySelectorAll('[role="feed"]').length,
    bodySample: document.body.innerText.substring(0, 300).replace(/\s+/g, ' '),
  }));
  console.log(`[${sourceUrl}] DIAG:`, JSON.stringify(diag));

  return extractPosts(page, MAX_POSTS_PER_SOURCE);
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
