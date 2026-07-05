// Construction du deck — module PUR (aucun DOM). Déduplication, clés stables,
// mélange à graine, entrelacement contraint. Testable en Node.

// Hash entier 32 bits déterministe (même algo que l'ancien `hashId`).
export function hashStr(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// URL canonique : sans fragment ni paramètres de tracking.
export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref_?|igshid|spm)/i.test(k)) u.searchParams.delete(k);
    }
    const qs = u.searchParams.toString();
    return u.origin + u.pathname + (qs ? "?" + qs : "");
  } catch {
    return String(url || "").trim();
  }
}

export function normTitle(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

// Clé d'un article (dédup + mémoire des vus) : URL canonique, sinon titre.
export function articleKey(c) {
  return c.link ? "u:" + canonicalUrl(c.link) : "t:" + hashStr(normTitle(c.title));
}

// Clé stable d'une flashcard (identité SRS) : type + recto.
export function cardFront(c) {
  return c.hanzi || c.term || c.question || c.title || "";
}
export function cardKey(c) {
  return c.type + ":" + hashStr(cardFront(c));
}

// Générateur pseudo-aléatoire à graine (mulberry32) → mélange reproductible/session.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates avec RNG injecté.
export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Entrelacement contraint : tire des files par type selon des poids, sans
// jamais dépasser `maxRun` cartes consécutives du même type.
//   queues  : { type: [cartes...] }  (chaque file déjà ordonnée)
//   weights : { type: number }
// Retourne un tableau unique entrelacé (consomme tout ce qui est fourni).
export function interleave(queues, weights, maxRun) {
  const q = {};
  for (const k of Object.keys(queues)) {
    if (queues[k] && queues[k].length) q[k] = [...queues[k]];
  }
  const served = {};
  for (const k of Object.keys(q)) served[k] = 0;

  const out = [];
  let last = null;
  let run = 0;
  const total = Object.values(q).reduce((n, l) => n + l.length, 0);

  while (out.length < total) {
    let cand = Object.keys(q).filter((k) => q[k].length);
    if (!cand.length) break;
    if (run >= maxRun) {
      const alt = cand.filter((k) => k !== last);
      if (alt.length) cand = alt; // force un autre type si possible
    }
    // Choisit le type le plus « en retard » proportionnellement à son poids.
    let best = null;
    let bestScore = Infinity;
    for (const k of cand) {
      const w = weights[k] || 1;
      const score = served[k] / w;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    out.push(q[best].shift());
    served[best]++;
    if (best === last) run++;
    else { last = best; run = 1; }
  }
  return out;
}
