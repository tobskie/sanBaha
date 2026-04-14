const TILE_CACHE = 'sanbaha-tiles-v1';
const MAPBOX_TILE_PATTERN = /api\.mapbox\.com\/v4\//;

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'START_NAV') {
    prewarmTiles(event.data.bbox, event.data.token);
  }
  if (event.data?.type === 'END_NAV') {
    caches.delete(TILE_CACHE);
  }
});

// Cache-first for Mapbox tiles during navigation
self.addEventListener('fetch', (event) => {
  if (!MAPBOX_TILE_PATTERN.test(event.request.url)) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch {
        return new Response('Tile unavailable offline', { status: 503 });
      }
    })
  );
});

// Pre-fetch tiles for zoom levels 12-15 within the route bounding box
async function prewarmTiles(bbox, token) {
  if (!bbox || !token) return;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cache = await caches.open(TILE_CACHE);
  const promises = [];

  for (let z = 12; z <= 15; z++) {
    const [xMin, yMax] = lngLatToTile(minLng, minLat, z);
    const [xMax, yMin] = lngLatToTile(maxLng, maxLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const url = `https://api.mapbox.com/v4/mapbox.streets/${z}/${x}/${y}.png?access_token=${token}`;
        promises.push(
          fetch(url)
            .then(r => { if (r.ok) cache.put(url, r); })
            .catch(() => {})
        );
        if (promises.length >= 200) break;
      }
      if (promises.length >= 200) break;
    }
    if (promises.length >= 200) break;
  }
  await Promise.allSettled(promises);
}

function lngLatToTile(lng, lat, z) {
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
  return [x, y];
}
