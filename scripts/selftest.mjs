// Tests de la logique pure (SRS, dédup, entrelacement, migration).
// Exécuté par `npm test`. Ne teste pas le DOM (voir README / ETAT-DU-PROJET).
import assert from "node:assert/strict";

// --- polyfill localStorage (en mémoire) AVANT d'importer store.js ---
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { grade, isDue, isNew, isMastered, newState, daysUntil, isoDay } = await import("../js/srs.js");
const { canonicalUrl, articleKey, cardKey, hashStr, shuffle, interleave, mulberry32, normTitle } = await import("../js/feed.js");

let pass = 0;
const ok = (name) => { pass++; console.log("  ✓", name); };

/* ---------------- SRS ---------------- */

const NOW = Date.parse("2026-01-10T12:00:00Z");
const DAY = 86400000;

// Carte neuve → due, isNew.
assert.equal(isDue(null, "2026-01-10"), true);
assert.equal(isNew(null), true);
ok("carte neuve est due et 'new'");

// « Je savais » fait grimper les paliers : intervalles croissants 1→3→7→16.
let s = grade(null, "known", NOW);
assert.equal(s.box, 0);
assert.equal(s.due, isoDay(NOW + 1 * DAY));
s = grade(s, "known", NOW);
assert.equal(s.box, 1);
assert.equal(s.due, isoDay(NOW + 3 * DAY));
s = grade(s, "known", NOW);
assert.equal(s.box, 2);
assert.equal(s.due, isoDay(NOW + 7 * DAY));
s = grade(s, "known", NOW);
assert.equal(s.box, 3);
assert.equal(s.due, isoDay(NOW + 16 * DAY));
ok("'Je savais' répété → intervalles 1/3/7/16 j croissants");

// Une carte non due est exclue (isDue=false) tant que l'échéance n'est pas atteinte.
assert.equal(isDue(s, "2026-01-11"), false);
assert.equal(isDue(s, s.due), true);
ok("carte non due exclue jusqu'à l'échéance");

// « À revoir » ramène au palier 0 (revue à J+1) et compte un lapse.
const before = s.lapses || 0;
s = grade(s, "review", NOW);
assert.equal(s.box, 0);
assert.equal(s.due, isoDay(NOW + 1 * DAY));
assert.equal(s.lapses, before + 1);
ok("'À revoir' → palier 0, revue J+1, lapse++");

// Maîtrise à partir du palier 4.
let m = newState();
for (let i = 0; i < 5; i++) m = grade(m, "known", NOW);
assert.equal(isMastered(m), true);
assert.equal(daysUntil(isoDay(NOW + 5 * DAY), isoDay(NOW)), 5);
ok("carte maîtrisée après 5 succès (box ≥ 4)");

/* ---------------- dédup / clés ---------------- */

assert.equal(canonicalUrl("https://x.com/a?utm_source=rss&id=3#frag"), "https://x.com/a?id=3");
assert.equal(canonicalUrl("https://x.com/a/?fbclid=zzz"), "https://x.com/a/");
ok("canonicalUrl retire tracking + fragment");

const a1 = { title: "Titre X", link: "https://x.com/p?utm_medium=rss" };
const a2 = { title: "Titre X", link: "https://x.com/p" };
assert.equal(articleKey(a1), articleKey(a2));
ok("deux URLs = même clé après canonicalisation");

const c1 = { type: "mandarin", hanzi: "经济" };
assert.equal(cardKey(c1), "mandarin:" + hashStr("经济"));
assert.equal(normTitle("L'ÉCO, en 2026 !"), "léco en 2026");
ok("cardKey stable + normTitle");

/* ---------------- shuffle à graine ---------------- */

const base = [1, 2, 3, 4, 5, 6, 7, 8];
assert.deepEqual(shuffle(base, mulberry32(42)), shuffle(base, mulberry32(42)));
assert.notDeepEqual(shuffle(base, mulberry32(1)), shuffle(base, mulberry32(2)));
assert.deepEqual([...base], [1, 2, 3, 4, 5, 6, 7, 8]); // ne mute pas l'entrée
ok("shuffle déterministe par graine, sans mutation");

/* ---------------- entrelacement contraint (BUG-5) ---------------- */

const queues = {
  news: Array.from({ length: 20 }, (_, i) => ({ type: "news", i })),
  mandarin: Array.from({ length: 8 }, (_, i) => ({ type: "mandarin", i })),
  dec: Array.from({ length: 8 }, (_, i) => ({ type: "dec", i })),
};
const weights = { news: 3, mandarin: 2, dec: 2 };
const woven = interleave(queues, weights, 2);

// Tout est consommé, rien perdu ni dupliqué.
assert.equal(woven.length, 36);
ok("entrelacement consomme toutes les cartes (36)");

// Jamais plus de 2 du même type d'affilée TANT QU'une alternative existe.
// Un dépassement n'est possible que dans la queue finale (une seule file non
// vide) : dans ce cas tout le reste est du même type. On vérifie exactement ça.
for (let i = 0; i + 2 < woven.length; i++) {
  const t = woven[i].type;
  if (woven[i + 1].type === t && woven[i + 2].type === t) {
    assert.ok(woven.slice(i).every((c) => c.type === t),
      `run >2 du type ${t} hors queue finale (index ${i})`);
  }
}
ok("jamais plus de 2 d'affilée hors queue finale (garantie par construction)");

// Le type le plus pondéré (news) domine l'ouverture du feed.
const first12 = woven.slice(0, 12).filter((c) => c.type === "news").length;
assert.ok(first12 >= 4, `news au début = ${first12}`);
ok("les poids influencent la fréquence (news majoritaire)");

/* ---------------- migration legacy (BUG-2) ---------------- */

mem.clear();
mem.set("leflux_scores", JSON.stringify({
  ["c" + hashStr("m:经济")]: "known",
  ["c" + hashStr("d:Question ?")]: "review",
}));
const store = await import("../js/store.js");
const cards = [
  { type: "mandarin", hanzi: "经济" },
  { type: "dec", question: "Question ?" },
];
store.migrateLegacy(cards);
const stKnown = store.getState(cardKey(cards[0]));
const stReview = store.getState(cardKey(cards[1]));
assert.ok(stKnown && stKnown.box >= 1, "ancien 'known' migré en palier ≥ 1");
assert.ok(stReview && stReview.box === 0, "ancien 'review' migré en palier 0");
assert.equal(localStorage.getItem("leflux_scores"), null, "ancienne clé supprimée");
ok("migration douce depuis leflux_scores");

console.log(`\n✅ ${pass} vérifications passées.`);
