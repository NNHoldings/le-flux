// Point d'entrée : charge les données, construit le deck (dédup + SRS +
// entrelacement), gère le scroll infini, les filtres, les stats et l'offline.

import { SOURCES, TYPE_KEYS, TYPES, LEARNING_KEYS, FEED } from "./config.js";
import { articleKey, cardKey, shuffle, interleave, mulberry32 } from "./feed.js";
import { isDue, isNew, isMastered, isoDay } from "./srs.js";
import * as store from "./store.js";
import { renderCard, renderPause, renderDone } from "./render.js";

const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const filtersEl = document.getElementById("filters");
const statsEl = document.getElementById("stats");
const refreshBtn = document.getElementById("refresh");
const offlineEl = document.getElementById("offline");

let pool = {};                 // { type: [cartes] }
let deck = [];                 // deck entrelacé de la session
let cursor = 0;
let activeFilter = store.getFilter();
let session = { rendered: 0, nextPauseAt: FEED.pauseEvery, done: false };
let rng = mulberry32(1);

const today = () => isoDay(Date.now());

/* ---------------- chargement ---------------- */

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
  // Migration douce des anciens scores + purge des articles vus.
  store.purgeSeen();
  store.migrateLegacy(LEARNING_KEYS.flatMap((k) => pool[k] || []));
  buildFilters();
  resetSession();
}

/* ---------------- construction du deck ---------------- */

function essentialCard() {
  return (pool.news || []).find((c) => Array.isArray(c.bullets) && c.bullets.length);
}

function newsQueue() {
  const items = (pool.news || []).filter((c) => !(Array.isArray(c.bullets) && c.bullets.length));
  const unseen = items.filter((c) => !store.isSeen(articleKey(c)));
  return shuffle(unseen, rng);
}

// File d'un type d'apprentissage : cartes dues d'abord (échéance croissante),
// puis un lot borné de cartes neuves.
function learningQueue(type) {
  const t = today();
  const withState = (pool[type] || []).map((c) => ({ c, st: store.getState(cardKey(c)) }));
  const due = withState
    .filter((x) => x.st && x.st.box >= 0 && isDue(x.st, t))
    .sort((a, b) => (a.st.due || "").localeCompare(b.st.due || ""));
  const fresh = shuffle(withState.filter((x) => isNew(x.st)), rng).slice(0, FEED.newPerType);
  return [...due.map((x) => x.c), ...fresh.map((x) => x.c)];
}

function buildDeck() {
  const types = activeFilter === "all" ? TYPE_KEYS : [activeFilter];
  const queues = {};
  for (const type of types) {
    queues[type] = type === "news" ? newsQueue() : learningQueue(type);
  }
  deck = interleave(queues, FEED.weights, FEED.maxRun);
  // La synthèse « L'essentiel » ouvre le flux (hors dédup des vus).
  const ess = essentialCard();
  if (ess && (activeFilter === "all" || activeFilter === "news")) deck.unshift(ess);
  cursor = 0;
}

function resetSession() {
  rng = mulberry32((Date.now() & 0xffffffff) >>> 0);
  session = { rendered: 0, nextPauseAt: FEED.pauseEvery, done: false };
  buildDeck();
  feedEl.innerHTML = "";
  statusEl.textContent = deck.length ? "" : "Aucune carte pour l'instant.";
  renderMore();
}

/* ---------------- bilan (carte de pause) ---------------- */

function bilan() {
  const t = today();
  let due = 0, mastered = 0;
  for (const type of LEARNING_KEYS) {
    for (const c of pool[type] || []) {
      const st = store.getState(cardKey(c));
      if (st && st.box >= 0 && isDue(st, t)) due++;
      if (isMastered(st)) mastered++;
    }
  }
  return { session: session.rendered, due, mastered };
}

/* ---------------- rendu incrémental ---------------- */

function renderMore() {
  if (session.done) return;
  if (!deck.length) { statusEl.textContent = "Aucune carte pour l'instant."; return; }

  for (let n = 0; n < FEED.batch; n++) {
    if (cursor >= deck.length) {                 // deck épuisé → état « à jour »
      feedEl.appendChild(renderDone(LEARNING_KEYS.some((k) => (pool[k] || []).length)));
      session.done = true;
      statusEl.textContent = "";
      return;
    }
    if (session.rendered >= session.nextPauseAt) {
      session.nextPauseAt += FEED.pauseEvery;
      feedEl.appendChild(renderPause(bilan()));
    }
    const c = deck[cursor++];
    feedEl.appendChild(renderCard(c));
    if (c.type === "news" && !(Array.isArray(c.bullets) && c.bullets.length)) {
      store.markSeen(articleKey(c));             // mémorise l'article lu
    }
    session.rendered++;
    store.bumpSeenToday();
    renderStats();
  }
}

/* ---------------- topbar : stats + filtres ---------------- */

function renderStats() {
  const s = store.getStats();
  statsEl.textContent = `👁 ${s.seenToday} · 🔥 ${s.streak}`;
  statsEl.title = `${s.seenToday} cartes vues aujourd'hui · série de ${s.streak} jour(s)`;
}

function buildFilters() {
  const opts = [{ key: "all", label: "Tout" }, ...TYPE_KEYS.map((k) => ({ key: k, label: TYPES[k].label }))];
  filtersEl.innerHTML = "";
  for (const o of opts) {
    const b = document.createElement("button");
    b.className = "chip" + (o.key === activeFilter ? " active" : "");
    b.textContent = o.label;
    b.setAttribute("aria-pressed", o.key === activeFilter ? "true" : "false");
    b.onclick = () => {
      activeFilter = o.key;
      store.setFilter(o.key);
      buildFilters();
      resetSession();
    };
    filtersEl.appendChild(b);
  }
}

/* ---------------- scroll infini + refresh + offline + SW ---------------- */

const io = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) renderMore();
}, { rootMargin: "800px" });
io.observe(document.getElementById("sentinel"));

if (refreshBtn) {
  refreshBtn.onclick = () => {
    refreshBtn.classList.add("spin");
    loadAll(true).finally(() => setTimeout(() => refreshBtn.classList.remove("spin"), 600));
  };
}

function updateOnline() {
  const off = !navigator.onLine;
  offlineEl.hidden = !off;
}
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();

if ("serviceWorker" in navigator) {
  // Le nouveau SW s'active (skipWaiting + claim) et sert le shell frais au
  // prochain lancement — pas de reload forcé en pleine session.
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

store.initStats();
renderStats();
loadAll();
