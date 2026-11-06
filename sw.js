// Keeps the app available offline; a new upload replaces the cached copy on the next launch.
const CACHE = 'khotwa-v3-2';
const AUDIO = 'khotwa-audio-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== AUDIO).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Recordings never change (their names are content hashes): serve from cache first.
  // Safari asks for media in byte ranges, so answer those from the full cached file.
  if (url.pathname.includes('/audio/')) {
    e.respondWith(audioResponse(e.request, url));
    return;
  }
  // Network first so updates arrive; cache when offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
});

async function audioResponse(req, url) {
  const c = await caches.open(AUDIO);
  const key = url.origin + url.pathname;
  let full = await c.match(key);
  if (!full) {
    try {
      const r = await fetch(key);
      if (!r.ok) return r;
      await c.put(key, r.clone());
      full = r;
    } catch (err) { return fetch(req); }
  }
  const range = req.headers.get('range');
  if (!range) return full.clone();
  const buf = await full.clone().arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const size = buf.byteLength;
  let start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  if (!m[1] && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; }
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes',
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': String(end - start + 1) } });
}
