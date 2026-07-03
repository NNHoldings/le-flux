const SOURCES = [
  { key: "news", file: "./data/news.json", label: "Actus" },
  { key: "mandarin", file: "./data/flashcards.json", label: "中文" },
  { key: "finance", file: "./data/finance.json", label: "Finance" },
  { key: "dec", file: "./data/dec.json", label: "DEC" },
];

const BATCH = 8;
const PAUSE_EVERY = 25;      // insère une carte de pause toutes les ~25 cartes

// Poids du deck pondéré (répétition espacée légère) :
//   "à revoir" ~3× plus souvent que la normale, "je savais" ~3× moins.
const W_REVIEW = 9;
const W_DEFAULT = 3;
const W_KNOWN = 1;

let pool = {};              // cartes groupées par type
let deck = [];              // deck pondéré + mélangé de la catégorie active
let cursor = 0;
let activeFilter = "all";

// Compteurs de session (remis à zéro à chaque ouverture / refresh).
let session = { rendered: 0, byType: {}, nextPauseAt: PAUSE_EVERY };

const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const filtersEl = document.getElementById("filters");
const statsEl = document.getElementById("stats");
const refreshBtn = document.getElementById("refresh");

/* ---------- localStorage : scores de révision + stats ---------- */

const SCORES_KEY = "leflux_scores";
const STATS_KEY = "leflux_stats";

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let scores = loadJSON(SCORES_KEY, {});   // { cardId: "known" | "review" }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Stats persistantes : compteur du jour (reset à minuit local) + streak.
let stats = loadJSON(STATS_KEY, { date: "", seenToday: 0, streak: 0, lastActive: "" });

function initStats() {
  const t = todayStr();
  if (stats.date !== t) {                       // nouveau jour → reset du compteur
    stats.seenToday = 0;
    stats.date = t;
  }
  // Streak : mise à jour à la première activité du jour.
  if (stats.lastActive !== t) {
    stats.streak = stats.lastActive === yesterdayStr() ? (stats.streak || 0) + 1 : 1;
    stats.lastActive = t;
  }
  saveJSON(STATS_KEY, stats);
  renderStats();
}

function renderStats() {
  if (!statsEl) return;
  statsEl.textContent = `👁 ${stats.seenToday} · 🔥 ${stats.streak}`;
  statsEl.title = `${stats.seenToday} cartes vues aujourd'hui · ${stats.streak} jour(s) d'affilée`;
}

function bumpSeen(type) {
  const t = todayStr();
  if (stats.date !== t) { stats.seenToday = 0; stats.date = t; }
  stats.seenToday++;
  session.rendered++;
  session.byType[type] = (session.byType[type] || 0) + 1;
  saveJSON(STATS_KEY, stats);
  renderStats();
}

/* ---------- identité stable d'une carte (clé de score) ---------- */

function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "c" + (h >>> 0).toString(36);
}
function cardId(c) {
  if (c.type === "mandarin" && c.hanzi) return hashId("m:" + c.hanzi);
  if (c.type === "dec" && c.question) return hashId("d:" + c.question);
  return null;   // pas de SRS pour news / finance
}

/* ---------- deck pondéré ---------- */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightFor(c) {
  const id = cardId(c);
  if (!id) return W_DEFAULT;
  const s = scores[id];
  if (s === "review") return W_REVIEW;
  if (s === "known") return W_KNOWN;
  return W_DEFAULT;
}

// Deck pondéré : chaque carte est répliquée selon son poids, puis mélangée.
// Relit `scores` à chaque appel → la fréquence reflète les réponses données.
function buildDeck() {
  const cards = activeFilter === "all"
    ? Object.values(pool).flat()
    : (pool[activeFilter] || []);
  const weighted = [];
  for (const c of cards) {
    const w = weightFor(c);
    for (let i = 0; i < w; i++) weighted.push(c);
  }
  deck = shuffle(weighted);
  cursor = 0;
}

/* ---------- chargement ---------- */

async function loadAll(force = false) {
  statusEl.textContent = "Chargement…";
  const opts = { cache: force ? "no-store" : "no-cache" };
  const results = await Promise.allSettled(
    SOURCES.map((s) => fetch(s.file, opts).then((r) => r.json()))
  );
  results.forEach((res, i) => {
    const key = SOURCES[i].key;
    pool[key] = res.status === "fulfilled" && Array.isArray(res.value)
      ? res.value.map((c) => ({ ...c, type: c.type || key }))
      : [];
  });
  session = { rendered: 0, byType: {}, nextPauseAt: PAUSE_EVERY };
  buildFilters();
  resetFeed();
}

function resetFeed() {
  buildDeck();
  feedEl.innerHTML = "";
  statusEl.textContent = deck.length ? "" : "Aucune carte dans cette catégorie pour l'instant.";
  renderMore();
}

function buildFilters() {
  const opts = [{ key: "all", label: "Tout" }, ...SOURCES];
  filtersEl.innerHTML = "";
  opts.forEach((o) => {
    const b = document.createElement("button");
    b.className = "chip" + (o.key === activeFilter ? " active" : "");
    b.textContent = o.label;
    b.onclick = () => {
      activeFilter = o.key;
      session.nextPauseAt = session.rendered + PAUSE_EVERY;
      buildFilters();
      resetFeed();
    };
    filtersEl.appendChild(b);
  });
}

/* ---------- rendu ---------- */

function renderMore() {
  if (!deck.length) return;
  for (let n = 0; n < BATCH; n++) {
    // Carte de pause anti-doomscroll toutes les ~25 cartes.
    if (session.rendered >= session.nextPauseAt) {
      session.nextPauseAt += PAUSE_EVERY;
      feedEl.appendChild(renderPauseCard());
    }
    if (cursor >= deck.length) buildDeck();   // boucle infinie, re-pondérée
    const c = deck[cursor++];
    feedEl.appendChild(renderCard(c));
    bumpSeen(c.type);
  }
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function kindHeader(cls, label) {
  return `<span class="kind ${cls}"><span class="dot"></span>${label}</span>`;
}

// Boutons de révision espacée (mandarin / dec), visibles après révélation.
function srsControls(card, c) {
  const id = cardId(c);
  if (!id) return;
  const wrap = el("div", "srs");
  const known = el("button", "srs-btn known", "✓ Je savais");
  const review = el("button", "srs-btn review", "↻ À revoir");
  const reflect = () => {
    known.classList.toggle("chosen", scores[id] === "known");
    review.classList.toggle("chosen", scores[id] === "review");
  };
  const set = (val) => (e) => {
    e.stopPropagation();
    scores[id] = scores[id] === val ? undefined : val;
    if (scores[id] === undefined) delete scores[id];
    saveJSON(SCORES_KEY, scores);
    reflect();
  };
  known.onclick = set("known");
  review.onclick = set("review");
  reflect();
  wrap.append(known, review);
  card.appendChild(wrap);
}

function renderPauseCard() {
  const card = el("article", "card pause");
  const y = session.byType.mandarin || 0;
  const z = session.byType.dec || 0;
  card.innerHTML =
    kindHeader("k-pause", "Pause") +
    `<h2>Tu as vu ${session.rendered} cartes</h2>` +
    `<p>Dont ${y} en mandarin et ${z} de révision DEC. Beau travail.<br>Continuer, ou s'arrêter là pour aujourd'hui ?</p>`;
  const actions = el("div", "srs");
  const cont = el("button", "srs-btn known", "Continuer ↓");
  cont.onclick = (e) => { e.stopPropagation(); card.classList.add("dismissed"); };
  actions.appendChild(cont);
  card.appendChild(actions);
  return card;
}

function renderCard(c) {
  const card = el("article", "card");
  if (c.type === "news") {
    card.classList.add("k-news");
    if (Array.isArray(c.bullets) && c.bullets.length) {
      // Carte « L'essentiel du jour » (3 points clés générés par l'IA).
      card.classList.add("essential");
      card.innerHTML =
        kindHeader("k-news", "L'essentiel") +
        `<h2>${esc(c.title || "L'essentiel du jour")}</h2>` +
        `<ul class="bullets">${c.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` +
        (c.date ? `<div class="meta">${esc(c.date)}</div>` : "");
    } else {
      card.innerHTML =
        kindHeader("k-news", c.source || "Actualité") +
        `<h2>${esc(c.title)}</h2>` +
        (c.summary ? `<p>${esc(c.summary)}</p>` : "") +
        `<div class="meta">${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Lire l'article →</a>` : ""}${c.date ? ` · ${esc(c.date)}` : ""}</div>`;
    }
  } else if (c.type === "mandarin") {
    card.classList.add("k-mandarin");
    card.innerHTML =
      kindHeader("k-mandarin", "Mandarin") +
      `<div class="hanzi">${esc(c.hanzi)}</div>` +
      `<div class="reveal hidden-answer"><strong>${esc(c.pinyin || "")}</strong> — ${esc(c.fr || "")}</div>` +
      `<div class="tap-hint">Touche pour révéler</div>`;
    card.onclick = () => card.classList.toggle("revealed");
    srsControls(card, c);
  } else if (c.type === "finance") {
    card.classList.add("k-finance");
    card.innerHTML =
      kindHeader("k-finance", "Finance") +
      `<h2>${esc(c.term)}</h2>` +
      `<p>${esc(c.explanation)}</p>`;
  } else if (c.type === "dec") {
    card.classList.add("k-dec");
    card.innerHTML =
      kindHeader("k-dec", "Révision DEC") +
      `<h2>${esc(c.question)}</h2>` +
      `<p class="hidden-answer">${esc(c.answer)}</p>` +
      `<div class="tap-hint">Touche pour révéler la réponse</div>`;
    card.onclick = () => card.classList.toggle("revealed");
    srsControls(card, c);
  }
  return card;
}

/* ---------- scroll infini + refresh + SW ---------- */

const io = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) renderMore();
}, { rootMargin: "600px" });
io.observe(document.getElementById("sentinel"));

if (refreshBtn) {
  refreshBtn.onclick = () => {
    refreshBtn.classList.add("spin");
    loadAll(true).finally(() => setTimeout(() => refreshBtn.classList.remove("spin"), 500));
  };
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

initStats();
loadAll();
