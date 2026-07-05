// Service Worker — offline complet.
//   Shell (HTML/CSS/JS/icônes) : cache-first.
//   Données (data/*.json)      : stale-while-revalidate (affiche vite, rafraîchit en fond).
// ⚠️ Incrémente CACHE à chaque modif de l'app pour forcer la mise à jour.
const CACHE = "le-flux-v4";

const SHELL = [
  "./",
  "./index.html",
  "./404.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/main.js",
  "./js/config.js",
  "./js/store.js",
  "./js/srs.js",
  "./js/feed.js",
  "./js/render.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const DATA = [
  "./data/news.json",
  "./data/flashcards.json",
  "./data/finance.json",
  "./data/dec.json",
  "./data/ia.json",
  "./data/histoire.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL);
      await Promise.allSettled(DATA.map((u) => c.add(u))); // best-effort (data optionnelle)
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Données : stale-while-revalidate.
  if (url.pathname.includes("/data/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Shell : cache-first, repli réseau, puis index.html pour les navigations.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).catch(() => (req.mode === "navigate" ? caches.match("./index.html") : undefined))
    )
  );
});
