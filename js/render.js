// Rendu DOM des cartes. Isolé de la logique de deck : reçoit une carte et
// renvoie un élément prêt à insérer.

import { TYPES } from "./config.js";
import { cardKey } from "./feed.js";
import { nextReviewLabel, isoDay } from "./srs.js";
import * as store from "./store.js";

export function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function header(type, overrideLabel) {
  const label = overrideLabel || TYPES[type]?.label || type;
  return `<span class="kind k-${type}"><span class="dot"></span>${esc(label)}</span>`;
}

// Recto / verso d'une flashcard, selon le type.
function faces(c) {
  if (c.type === "mandarin") {
    return {
      front: `<div class="hanzi">${esc(c.hanzi)}</div>`,
      back: `<strong>${esc(c.pinyin || "")}</strong>${c.fr ? " — " + esc(c.fr) : ""}`,
    };
  }
  const front = c.term || c.question || "";
  const back = c.explanation || c.answer || "";
  return { front: `<h2>${esc(front)}</h2>`, back: esc(back) };
}

/* ---------- carte d'apprentissage (révélation + SRS) ---------- */

function renderLearning(c) {
  const card = el("article", `card k-${c.type} flip`);
  const { front, back } = faces(c);
  const key = cardKey(c);

  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-expanded", "false");
  card.innerHTML =
    header(c.type) +
    `<div class="front">${front}</div>` +
    `<div class="back hidden-answer">${back}</div>` +
    `<div class="tap-hint">Touche pour révéler</div>`;

  const srs = el("div", "srs");
  const known = el("button", "srs-btn known", "✓ Je savais");
  const review = el("button", "srs-btn review", "↻ À revoir");
  known.setAttribute("aria-label", "Je connaissais cette carte");
  review.setAttribute("aria-label", "À revoir");
  const label = el("div", "srs-label");
  srs.append(known, review);
  card.append(srs, label);

  let chosen = null; // bouton cliqué dans cette session (surlignage fiable)
  const reflect = () => {
    known.classList.toggle("chosen", chosen === "known");
    review.classList.toggle("chosen", chosen === "review");
    const st = store.getState(key);
    label.textContent = chosen && st ? nextReviewLabel(st, isoDay(Date.now())) : "";
  };
  const respond = (verdict) => (e) => {
    e.stopPropagation();
    chosen = verdict;
    store.answer(key, verdict);
    reflect();
  };
  known.onclick = respond("known");
  review.onclick = respond("review");
  reflect();

  const toggle = () => {
    const open = card.classList.toggle("revealed");
    card.setAttribute("aria-expanded", open ? "true" : "false");
  };
  card.addEventListener("click", toggle);
  card.addEventListener("keydown", (e) => {
    if (e.target !== card) return;                 // laisse les boutons SRS gérer leur touche
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  return card;
}

/* ---------- carte actualité ---------- */

function renderNews(c) {
  const card = el("article", "card k-news");
  if (Array.isArray(c.bullets) && c.bullets.length) {
    card.classList.add("essential");
    card.innerHTML =
      header("news", "L'essentiel") +
      `<h2>${esc(c.title || "L'essentiel du jour")}</h2>` +
      `<ul class="bullets">${c.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` +
      (c.date ? `<div class="meta">${esc(c.date)}</div>` : "");
    return card;
  }
  card.innerHTML =
    header("news", c.source || "Actualité") +
    `<h2>${esc(c.title)}</h2>` +
    (c.summary ? `<p>${esc(c.summary)}</p>` : "") +
    `<div class="meta">` +
      (c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Lire la source →</a>` : "") +
      (c.date ? `<span class="date">${esc(c.date)}</span>` : "") +
    `</div>`;
  return card;
}

/* ---------- cartes système ---------- */

export function renderPause(bilan) {
  const card = el("article", "card pause");
  card.innerHTML =
    header("pause", "Pause") +
    `<h2>Tu as vu ${bilan.session} cartes</h2>` +
    `<p>${bilan.due} carte(s) à réviser aujourd'hui · ${bilan.mastered} maîtrisée(s).<br>` +
    `Continuer, ou t'arrêter là pour aujourd'hui ?</p>`;
  const actions = el("div", "srs");
  const cont = el("button", "srs-btn known", "Continuer ↓");
  cont.onclick = (e) => { e.stopPropagation(); card.classList.add("dismissed"); };
  actions.appendChild(cont);
  card.appendChild(actions);
  return card;
}

export function renderDone(hasLearning) {
  const card = el("article", "card done");
  card.innerHTML =
    header("pause", "À jour") +
    `<h2>Tu es à jour 🎉</h2>` +
    `<p>${hasLearning
      ? "Toutes les actus non lues et les cartes dues sont passées. Reviens plus tard : le flux se remplit 3×/jour."
      : "Tu as parcouru tout le contenu disponible. Le flux se remplit automatiquement 3×/jour."}</p>`;
  return card;
}

/* ---------- dispatch ---------- */

export function renderCard(c) {
  return TYPES[c.type]?.learning ? renderLearning(c) : renderNews(c);
}
