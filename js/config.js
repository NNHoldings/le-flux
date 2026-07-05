// Configuration centrale de l'application. Toute constante de comportement
// (types de cartes, ratios du feed, paliers de répétition espacée) vit ici.

// Les 6 types de contenu. `learning: true` → flashcard (révélation + SRS).
export const TYPES = {
  news:     { label: "Actus",    accent: "blue",   learning: false },
  mandarin: { label: "中文",      accent: "pink",   learning: true  },
  finance:  { label: "Finance",  accent: "teal",   learning: true  },
  dec:      { label: "DEC",      accent: "amber",  learning: true  },
  ia:       { label: "IA / Tech", accent: "violet", learning: true },
  histoire: { label: "Histoire", accent: "sand",   learning: true  },
};

export const TYPE_KEYS = Object.keys(TYPES);
export const LEARNING_KEYS = TYPE_KEYS.filter((k) => TYPES[k].learning);

// Fichiers de données (chemins relatifs — GitHub Pages sert sous /le-flux/).
export const SOURCES = [
  { key: "news",     file: "./data/news.json" },
  { key: "mandarin", file: "./data/flashcards.json" },
  { key: "finance",  file: "./data/finance.json" },
  { key: "dec",      file: "./data/dec.json" },
  { key: "ia",       file: "./data/ia.json" },
  { key: "histoire", file: "./data/histoire.json" },
];

// Comportement du feed.
export const FEED = {
  batch: 8,          // cartes rendues par lot (scroll infini)
  pauseEvery: 24,    // carte de pause toutes les N cartes
  maxRun: 2,         // jamais plus de N cartes du même type d'affilée
  // Poids relatifs d'apparition par type dans l'entrelacement.
  weights: { news: 3, mandarin: 2, dec: 2, finance: 1, ia: 1, histoire: 1 },
  // Nb max de cartes d'apprentissage NEUVES injectées par session et par type
  // quand peu de cartes sont dues (évite de tout apprendre d'un coup).
  newPerType: 8,
};

// Répétition espacée (Leitner à paliers). Intervalle en jours par « boîte ».
export const SRS = {
  intervals: [1, 3, 7, 16, 35, 75, 150],  // box 0 → 6
  masteredBox: 4,                          // à partir d'ici, carte « maîtrisée »
};

// Clés localStorage (versionnées pour permettre des migrations futures).
export const KEYS = {
  seen:   "leflux_seen_v1",     // { articleKey: "YYYY-MM-DD" }
  srs:    "leflux_srs_v1",      // { cardKey: {box,due,reps,lapses,last} }
  stats:  "leflux_stats",       // { date, seenToday, streak, lastActive }
  prefs:  "leflux_prefs_v1",    // { filter }
  legacy: "leflux_scores",      // ancienne clé (migrée puis supprimée)
};

export const SEEN_TTL_DAYS = 30;   // purge des articles vus au-delà
