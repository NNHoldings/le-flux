# 点滴 · Le Flux

Ton flux personnel enrichissant pour remplacer le scroll réflexe : actus éco/géo,
flashcards de mandarin, concepts de finance, fiches de révision DEC.

**Architecture (coût = 0 €)**
- PWA statique (HTML/CSS/JS, aucun build) servie par **GitHub Pages**.
- Un **cron GitHub Actions** rafraîchit les actus chaque matin depuis des flux RSS.
- Un **job manuel** génère des cartes via **GitHub Models** (IA gratuite, jeton intégré).
- L'app ne fait que lire des fichiers JSON → **zéro appel API à l'usage**.

---

## 1. Mettre en ligne (une seule fois, ~5 min)

1. Crée un dépôt GitHub **public** (public = Actions + Pages 100 % gratuits) et pousse ces fichiers :
   ```bash
   git init && git add . && git commit -m "init le flux"
   git branch -M main
   git remote add origin https://github.com/TON_USER/le-flux.git
   git push -u origin main
   ```
2. **Active Pages** : *Settings → Pages → Build and deployment → Source : « Deploy from a branch » → Branch : `main` / `/ (root)` → Save.*
   Ton app sera dispo à `https://TON_USER.github.io/le-flux/` (compte ~1 min au 1er déploiement).
3. **Autorise les workflows à écrire** (pour que le cron puisse committer les actus) :
   *Settings → Actions → General → Workflow permissions → « Read and write permissions » → Save.*

## 2. Installer sur iPhone

Ouvre `https://TON_USER.github.io/le-flux/` **dans Safari** → bouton Partager →
**« Sur l'écran d'accueil »**. Une vraie icône apparaît, l'app se lance en plein écran
et fonctionne hors-ligne. (L'installation ne marche que depuis Safari sur iOS.)

## 3. Alimenter le flux

**Actus** — automatique chaque matin. Pour lancer tout de suite : onglet *Actions →
« Mise à jour des actus » → Run workflow*. Édite la liste des flux RSS dans
[`scripts/fetch-news.mjs`](scripts/fetch-news.mjs).

**Cartes IA (mandarin / finance / DEC)** — quand tu veux enrichir :
onglet *Actions → « Générer des cartes (IA) » → Run workflow*, choisis le type,
le thème (ex. `IFRS 15`, `vocabulaire de la banque`, `NEP 240`) et le nombre.
Les cartes sont ajoutées au JSON correspondant et committées automatiquement.
Tu peux aussi déclencher tout ça depuis l'app **GitHub** sur ton iPhone.

---

## Personnalisation

| Envie | Où |
|---|---|
| Changer les flux RSS | `scripts/fetch-news.mjs` → `FEEDS` |
| Ajouter/éditer des cartes à la main | `data/flashcards.json`, `data/finance.json`, `data/dec.json` |
| Couleurs / thème | `styles.css` (variables `:root`) |
| Rythme du cron | `.github/workflows/update-news.yml` → `cron` |

## Notes

- **GitHub Models** : l'ID de modèle et l'endpoint peuvent évoluer. Si le job IA renvoie
  une erreur de modèle, vérifie l'ID courant sur https://github.com/marketplace/models
  et ajuste `ENDPOINT` / `MODEL` en tête de `scripts/generate-content.mjs`.
- Le palier gratuit de GitHub Models a un débit limité par minute : pour de gros lots,
  génère en plusieurs passes (ex. 10 cartes à la fois).
- Repo public = le contenu JSON est visible publiquement. Comme il ne contient que des
  actus, du vocabulaire et des fiches, aucun souci de confidentialité.
