# BRIEF CLAUDE CODE — 点滴 · Le Flux

## Contexte et objectif produit

Je suis auditeur, j'apprends le mandarin et je prépare le DEC. Je veux **remplacer le
scroll réflexe (Instagram) par un scroll qui me rend meilleur** : un feed infini de
cartes mélangées — actus éco/géopolitique, flashcards de mandarin, concepts de
finance, fiches de révision DEC.

Le principe directeur : **chaque carte scrollée doit m'apprendre quelque chose**, et
l'app doit m'aider à mesurer et consolider ce que j'apprends (pas juste consommer).

## Contraintes NON NÉGOCIABLES

1. **Coût total : 0 €.** Aucune API payante, aucun service avec carte bancaire.
   - Hébergement : GitHub Pages (repo public).
   - Automatisation : GitHub Actions (gratuit illimité en repo public).
   - IA : GitHub Models via le `GITHUB_TOKEN` intégré (`permissions: models: read`).
     PAS d'API Anthropic, PAS d'OpenAI payant. Si GitHub Models pose problème,
     l'alternative validée est Gemini via AI Studio (palier gratuit sans CB), mais
     GitHub Models d'abord.
2. **Zéro consommation à l'usage.** L'app ne fait AUCUN appel LLM quand je scrolle.
   Tout le contenu est pré-généré en JSON statique dans `data/`, commité dans le repo.
3. **Pas de build step.** HTML/CSS/JS vanilla (ES modules OK). Pas de React, pas de
   bundler, pas de framework. GitHub Pages sert le repo tel quel depuis la racine.
4. **Cible : iPhone via PWA Safari** (Partager → Sur l'écran d'accueil). Plein écran,
   offline via service worker, dark theme obligatoire.
5. **Tout stockage côté client en `localStorage`** (c'est un vrai site web, pas un
   artifact — localStorage fonctionne). Pas de backend, pas de base de données.

## État actuel du code (dans le zip fourni / repo)

```
le-flux/
├── index.html                      # shell PWA (topbar + filtres + feed + sentinel)
├── styles.css                      # dark theme, cartes par type (4 couleurs)
├── app.js                          # chargement JSON, deck mélangé, scroll infini
│                                   #   (IntersectionObserver), rendu par type,
│                                   #   tap-to-reveal (mandarin & dec), filtres
├── sw.js                           # SW : cache-first shell, network-first data/
├── manifest.webmanifest            # PWA manifest (standalone, portrait)
├── icons/                          # icon-180/192/512 (goutte teal sur fond sombre)
├── data/
│   ├── news.json                   # écrasé 3×/jour par le cron (07h, 13h, 19h Paris)
│   ├── flashcards.json             # mandarin {hanzi, pinyin, fr}
│   ├── finance.json                # {term, explanation}
│   └── dec.json                    # {question, answer}
├── scripts/
│   ├── fetch-news.mjs              # RSS → news.json (fast-xml-parser, seule dep)
│   └── generate-content.mjs        # GitHub Models → ajoute cartes au JSON du type
├── .github/workflows/
│   ├── update-news.yml             # cron 05h/11h/17h UTC (07h/13h/19h Paris) + manuel
│   └── generate-content.yml        # manuel avec inputs (type, topic, count)
├── package.json                    # deps: fast-xml-parser uniquement
└── README.md                       # setup Pages, permissions Actions, install iPhone
```

### Décisions d'architecture (à respecter)
- Flux de données : RSS/IA → GitHub Actions → JSON commités → Pages → PWA lit les JSON.
- `app.js` : les 4 sources sont chargées en `Promise.allSettled` (une source qui
  échoue ne casse pas le feed). Deck global mélangé, rebouclé/remélangé à
  l'épuisement (scroll réellement infini).
- Workflows : `concurrency: group: data-updates`, et ordre commit → `git pull
  --rebase` → push (évite les courses entre le cron et le job IA).
- `esc()` échappe `& < > " '` (les liens RSS vont dans des attributs href).
- `fetch-news.mjs` : UA de navigateur réaliste (les sites de presse FR bloquent les
  UA de bots), décodage des entités HTML (accents français : `&#233;` → `é`),
  dédoublonnage par titre, tri par date, 45 items max, résumés tronqués à 240 car.
- SW : `CACHE = "le-flux-v2"` — **incrémenter à chaque modif de l'app**, sinon les
  clients installés gardent l'ancienne version.

## TÂCHES — améliorations à construire (par priorité)

Objectif commun : transformer le scroll passif en apprentissage actif mesurable.

### P1 — Répétition espacée légère (le cœur de la valeur)
Sur les cartes mandarin et DEC, après révélation, afficher deux boutons :
**« ✓ Je savais »** / **« ↻ À revoir »**.
- Stocker en localStorage un score par carte (clé stable : hash du hanzi/question).
- Pondérer le deck : les cartes « à revoir » réapparaissent ~3× plus souvent, les
  cartes sues ~3× moins (weighted shuffle simple, pas de SM-2 complet).
- Ne pas bloquer le scroll : répondre est optionnel, scroller passe la carte.

### P2 — Stats de session et de progression
- Compteur discret dans la topbar : cartes vues aujourd'hui + streak de jours
  consécutifs d'utilisation (localStorage, reset à minuit locale).
- Toutes les ~25 cartes, insérer une **carte de pause** dans le feed : « Tu as vu X
  cartes, dont Y mandarin et Z DEC. Continuer ou s'arrêter là ? » — c'est
  l'anti-doomscroll : rendre la session consciente, jamais culpabilisante.

### P3 — Carte « 3 points clés du jour »
Étendre `update-news.yml` : après le fetch RSS, un step optionnel appelle GitHub
Models pour synthétiser les actus du jour en UNE carte « L'essentiel » (3 bullet
points), écrite en tête de `news.json`. Si l'appel échoue (rate limit), le workflow
NE DOIT PAS échouer — les actus brutes suffisent (step avec `continue-on-error` ou
try/catch dans le script).

### P4 — Confort
- Bouton refresh discret (re-fetch des JSON + re-shuffle) dans la topbar.
- Transition douce au reveal (le blur existe déjà, ajouter une micro-animation).
- Page 404.html qui redirige vers index (Pages + PWA scope).
- Meta og:title/description pour un partage propre.

### Hors scope (ne pas faire)
Comptes utilisateurs, sync multi-appareils, notifications push, analytics externes,
tout service tiers non gratuit, tout framework.

## Pièges connus (vécus, ne pas re-découvrir)

1. **GitHub Models** : endpoint actuel `https://models.github.ai/inference/chat/completions`,
   modèle `openai/gpt-4o-mini`. Les IDs évoluent — en cas d'erreur 404/400, vérifier
   sur https://github.com/marketplace/models. Rate limit gratuit serré (~8k tokens
   in / 4k out par minute) : générer par lots de ≤10 cartes, jamais de gros batch.
2. **RSS 403** : certains flux bloquent quand même. Le script doit logger et ignorer
   la source, jamais crasher. Tester chaque URL de `FEEDS` réellement depuis Actions
   (pas en local si le réseau est restreint).
3. **Cron auto-désactivé** : GitHub coupe les workflows planifiés après 60 jours sans
   activité sur le repo. Les commits quotidiens du bot maintiennent l'activité, mais
   si le job « commit si diff » ne commite jamais (actus identiques), le risque
   existe. Garder ce comportement en tête.
4. **Permissions** : Settings → Actions → General → « Read and write permissions »
   obligatoire, sinon le push du bot échoue. Le workflow IA a besoin de
   `permissions: models: read` en plus de `contents: write`.
5. **Chemins relatifs partout** (`./`) : Pages sert sous `/le-flux/`, tout chemin
   absolu (`/data/...`) casse. Idem dans le SW.
6. **SW et itération** : pendant le dev, tester en navigation privée ou penser à
   incrémenter le cache, sinon on débogue une vieille version.

## Critères d'acceptation

- [ ] `npm run news` produit un `data/news.json` valide avec accents corrects.
- [ ] Le workflow IA ajoute des cartes sans doublons et committe.
- [ ] L'app s'installe sur iPhone (Safari), se lance en standalone, fonctionne offline
      après première visite.
- [ ] Scroll infini fluide, filtres fonctionnels, reveal au tap.
- [ ] « Je savais / À revoir » modifie visiblement la fréquence de réapparition.
- [ ] Streak et compteur persistent entre sessions (localStorage).
- [ ] Aucune requête sortante depuis l'app hormis les JSON du même origin.
- [ ] Lighthouse PWA : installable, pas d'erreur console.

## Workflow de développement attendu

Travailler par petits commits thématiques. Tester `fetch-news.mjs` et
`generate-content.mjs` en local avec Node 20 avant de toucher aux workflows. Pour
l'UI, servir localement (`npx serve` ou `python3 -m http.server`) et tester au
viewport iPhone. Ne jamais introduire de dépendance sans justifier qu'elle est
nécessaire ET gratuite.
