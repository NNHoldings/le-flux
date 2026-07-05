// Répétition espacée — Leitner à paliers. Module PUR (aucun DOM, aucun
// localStorage) → testable directement en Node.
//
// État d'une carte : { box, due, reps, lapses, last }
//   box   : indice de palier (-1 = jamais vue) → SRS.intervals[box] jours
//   due   : date d'échéance "YYYY-MM-DD" (null si neuve)
//   reps  : nombre de « Je savais » cumulés
//   lapses: nombre de « À revoir »
//   last  : date de dernière réponse

import { SRS } from "./config.js";

const DAY_MS = 86400000;

export function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function newState() {
  return { box: -1, due: null, reps: 0, lapses: 0, last: null };
}

// Une carte est « due » si jamais vue ou si son échéance est passée/aujourd'hui.
export function isDue(state, todayIso) {
  if (!state || state.box < 0 || !state.due) return true;
  return state.due <= todayIso;
}

export function isNew(state) {
  return !state || state.box < 0;
}

export function isMastered(state) {
  return !!state && state.box >= SRS.masteredBox;
}

// Applique une réponse. `answer` ∈ {"known","review"}. `nowMs` = Date.now().
export function grade(state, answer, nowMs) {
  const s = state ? { ...state } : newState();
  if (answer === "known") {
    s.box = Math.min(s.box < 0 ? 0 : s.box + 1, SRS.intervals.length - 1);
    s.reps = (s.reps || 0) + 1;
  } else {
    // « À revoir » → retour au palier 0 (revue à J+1) + relance en session.
    s.box = 0;
    s.lapses = (s.lapses || 0) + 1;
  }
  const days = SRS.intervals[Math.max(0, s.box)];
  s.due = isoDay(nowMs + days * DAY_MS);
  s.last = isoDay(nowMs);
  return s;
}

// Nombre de jours entre aujourd'hui et l'échéance (pour l'affichage).
export function daysUntil(dueIso, todayIso) {
  if (!dueIso) return 0;
  const a = Date.parse(dueIso + "T00:00:00Z");
  const b = Date.parse(todayIso + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / DAY_MS);
}

// Libellé humain de la prochaine revue.
export function nextReviewLabel(state, todayIso) {
  if (!state || !state.due) return "";
  const d = daysUntil(state.due, todayIso);
  if (d <= 0) return "à revoir bientôt";
  if (d === 1) return "revue demain";
  if (d < 7) return `revue dans ${d} j`;
  if (d < 30) return `revue dans ${Math.round(d / 7)} sem.`;
  return `revue dans ${Math.round(d / 30)} mois`;
}
