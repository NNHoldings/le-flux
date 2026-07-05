// Persistance localStorage : articles vus, états SRS, stats/streak, préférences.
// Fin couche autour de localStorage — tolérante aux erreurs (mode privé, quota).

import { KEYS, SEEN_TTL_DAYS } from "./config.js";
import { isoDay, grade } from "./srs.js";
import { cardKey, hashStr } from "./feed.js";

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota / privé */ }
}

function todayIso() { return isoDay(Date.now()); }
function yesterdayIso() { return isoDay(Date.now() - 86400000); }

/* ---------------- Articles vus (BUG-1) ---------------- */

let seen = read(KEYS.seen, {});

// Purge des entrées de plus de SEEN_TTL_DAYS jours (au démarrage).
export function purgeSeen() {
  const cutoff = isoDay(Date.now() - SEEN_TTL_DAYS * 86400000);
  let changed = false;
  for (const k of Object.keys(seen)) {
    if (seen[k] < cutoff) { delete seen[k]; changed = true; }
  }
  if (changed) write(KEYS.seen, seen);
}

export function isSeen(key) { return !!seen[key]; }
export function markSeen(key) {
  if (!seen[key]) { seen[key] = todayIso(); write(KEYS.seen, seen); }
}

/* ---------------- États SRS (BUG-2) ---------------- */

let srs = read(KEYS.srs, {});

export function getState(key) { return srs[key] || null; }

export function answer(key, verdict) {
  srs[key] = grade(srs[key], verdict, Date.now());
  write(KEYS.srs, srs);
  return srs[key];
}

// Migration douce depuis l'ancienne clé `leflux_scores` ({id:"known"|"review"}).
// L'ancien id était "c"+hashStr("m:"+hanzi) / "c"+hashStr("d:"+question).
export function migrateLegacy(cards) {
  const legacy = read(KEYS.legacy, null);
  if (!legacy || typeof legacy !== "object") return;
  for (const c of cards) {
    const prefix = c.type === "mandarin" ? "m:" : c.type === "dec" ? "d:" : null;
    if (!prefix) continue;
    const oldId = "c" + hashStr(prefix + (c.hanzi || c.question || ""));
    const verdict = legacy[oldId];
    const k = cardKey(c);
    if (verdict && !srs[k]) {
      // "known" → déjà bien connu (palier 2), "review" → à revoir (palier 0).
      srs[k] = grade(verdict === "known" ? { box: 1, due: null, reps: 1, lapses: 0, last: null } : null,
                     verdict, Date.now());
    }
  }
  write(KEYS.srs, srs);
  try { localStorage.removeItem(KEYS.legacy); } catch { /* noop */ }
}

/* ---------------- Stats & streak (P2) ---------------- */

let stats = read(KEYS.stats, { date: "", seenToday: 0, streak: 0, lastActive: "" });

export function initStats() {
  const t = todayIso();
  if (stats.date !== t) { stats.seenToday = 0; stats.date = t; }
  if (stats.lastActive !== t) {
    stats.streak = stats.lastActive === yesterdayIso() ? (stats.streak || 0) + 1 : 1;
    stats.lastActive = t;
  }
  write(KEYS.stats, stats);
  return { ...stats };
}

export function bumpSeenToday() {
  const t = todayIso();
  if (stats.date !== t) { stats.seenToday = 0; stats.date = t; }
  stats.seenToday++;
  write(KEYS.stats, stats);
  return stats.seenToday;
}

export function getStats() { return { ...stats }; }

/* ---------------- Préférences (filtre persistant) ---------------- */

let prefs = read(KEYS.prefs, { filter: "all" });

export function getFilter() { return prefs.filter || "all"; }
export function setFilter(f) { prefs.filter = f; write(KEYS.prefs, prefs); }

/* ---------------- Accès agrégé (pour le bilan) ---------------- */

export function allStates() { return srs; }
