# 点滴 · Le Flux

Un scroll qui te rend meilleur. Un feed infini de cartes mélangées — actualités à
haute valeur (macro, marchés, géopolitique, énergie, IA, science), flashcards de
**mandarin**, concepts de **finance**, révisions **DEC**, notions d'**IA/tech** et
d'**histoire** — avec **répétition espacée** pour vraiment mémoriser.

**Coût = 0 €.** PWA statique servie par GitHub Pages, alimentée par GitHub Actions
et GitHub Models (IA gratuite). Aucun backend, aucune clé API, aucun build.

**En ligne :** https://nnholdings.github.io/le-flux/

---

## 1. Comment ça marche

- **PWA statique** (HTML/CSS/JS vanilla, modules ES) — pas de bundler, pas de framework.
- Un **cron GitHub Actions** rafraîchit les actus 3×/jour depuis ~18 flux RSS,
  filtrés par un **scoring de pertinence** (macro, marchés, géopolitique, énergie,
  défense, IA, tech, science) pour éliminer les faits divers.
- Un autre **cron 3×/jour** génère des flashcards (mandarin / finance / DEC / IA /
  histoire) via GitHub Models, en rotation automatique.
- L'app ne fait que **lire des JSON** → zéro appel API à l'usage. Elle fonctionne
  **hors ligne** après la première visite (Service Worker).

### Répétition espacée (SRS)
Sur chaque flashcard, après révélation : **« ✓ Je savais »** / **« ↻ À revoir »**.
Les intervalles s'allongent à chaque succès (1 → 3 → 7 → 16 → 35 → 75 → 150 jours) ;
une carte « à revoir » revient à J+1. Les cartes non dues sont **exclues** du feed
tant qu'elles ne sont pas à échéance. Tout est stocké en `localStorage`.

### Diversité
Un **entrelacement contraint** évite plus de 2 cartes du même type d'affilée et
mixe naturellement actus et apprentissage. Les articles déjà vus ne réapparaissent
pas tant qu'il reste du neuf ; quand tout est vu, une carte « tu es à jour » s'affiche.

---

## 2. Mettre en ligne (une seule fois)

1. Repo GitHub **public** (public = Actions + Pages gratuits), pousse ces fichiers.
2. **Pages → Source = « GitHub Actions »** (le déploiement est géré par
   `.github/workflows/deploy-pages.yml`, plus fiable que « Deploy from a branch »).
3. **Settings → Actions → General → « Read and write permissions »** (le bot commite
   les actus et les cartes).

## 3. Installer sur iPhone

Ouvre l'URL **dans Safari** → Partager → **« Sur l'écran d'accueil »**. L'app se lance
en plein écran et fonctionne hors-ligne.

## 4. Alimenter le flux

- **Actus** : automatique 3×/jour. Manuel : *Actions → « Mise à jour des actus »*.
  Sources dans [`scripts/fetch-news.mjs`](scripts/fetch-news.mjs) → `FEEDS` (+ mots-clés
  de scoring dans `KEYWORDS`).
- **Cartes IA** : automatique 3×/jour, rotation sur les 5 types d'apprentissage.
  Manuel avec thème précis : *Actions → « Générer des cartes (IA) »*.

---

## 5. Architecture du code

```
index.html            shell PWA (topbar : stats, refresh, filtres ; feed)
styles.css            thème dark, 6 accents, animations sobres, reduced-motion
js/
  config.js           configuration centrale (types, ratios feed, paliers SRS, clés)
  srs.js              répétition espacée (Leitner à paliers) — pur, testé
  feed.js             dédup, clés stables, shuffle à graine, entrelacement — pur, testé
  store.js            localStorage (vus, SRS, stats, prefs) + migration + purge 30 j
  render.js           rendu DOM des cartes (flashcards, actus, pause, « à jour »)
  main.js             orchestration : chargement, deck, scroll infini, filtres, offline
sw.js                 Service Worker : shell cache-first, data stale-while-revalidate
data/*.json           news, flashcards (mandarin), finance, dec, ia, histoire
scripts/
  fetch-news.mjs      RSS → news.json (scoring, dédup, round-robin, résumés riches)
  daily-digest.mjs    « L'essentiel du jour » (3 points, GitHub Models) — non bloquant
  generate-content.mjs cartes IA (6 types, rotation auto) — GitHub Models
  selftest.mjs        tests de la logique pure (`npm test`)
.github/workflows/
  update-news.yml     cron 3×/j : actus + synthèse
  generate-content.yml cron 3×/j : cartes IA (+ manuel)
  deploy-pages.yml    déploiement Pages sur push main
```

## 6. Développement

```bash
npm install
npm test        # logique pure : SRS, dédup, entrelacement, migration
npm run news    # récupère les actus → data/news.json
npm run generate GITHUB_TOKEN=… TYPE=ia TOPIC="les LLM" COUNT=6
```
Pour l'UI : `npx serve` puis ouvrir au viewport iPhone. Node 20+.

## 7. Personnalisation

| Envie | Où |
|---|---|
| Sources / mots-clés d'actus | `scripts/fetch-news.mjs` (`FEEDS`, `KEYWORDS`) |
| Ratios du feed, paliers SRS | `js/config.js` (`FEED`, `SRS`) |
| Thèmes de génération auto | `scripts/generate-content.mjs` (`AUTO_TOPICS`) |
| Couleurs / thème | `styles.css` (variables `:root`) |
| Rythme des crons | `.github/workflows/*.yml` (`cron`) |

Repo public = le contenu JSON (actus, vocabulaire, fiches) est visible publiquement.
Rien de personnel ni de confidentiel n'y figure.
