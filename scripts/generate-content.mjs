// Génère des cartes (mandarin / finance / dec) via GitHub Models — gratuit,
// authentifié par le jeton intégré du workflow (GITHUB_TOKEN). Aucune clé à créer.
//
// Variables d'environnement attendues :
//   GITHUB_TOKEN  (fourni automatiquement par GitHub Actions)
//   TYPE          "mandarin" | "finance" | "dec"
//   TOPIC         thème libre, ex. "vocabulaire de la banque"
//   COUNT         nombre de cartes à générer (défaut 10)
//
// ⚠️ Si l'API renvoie une erreur de modèle, vérifie l'ID du modèle sur
// https://github.com/marketplace/models et ajuste ENDPOINT / MODEL ci-dessous.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4o-mini";

const TYPE = process.env.TYPE || "mandarin";
const TOPIC = process.env.TOPIC || "notions générales";
const COUNT = parseInt(process.env.COUNT || "10", 10);
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) { console.error("GITHUB_TOKEN manquant."); process.exit(1); }

const SCHEMAS = {
  mandarin: {
    file: "data/flashcards.json",
    key: "hanzi",
    shape: `{ "hanzi": "汉字", "pinyin": "pīnyīn avec tons", "fr": "traduction française" }`,
    brief: `des flashcards de vocabulaire chinois (mandarin) niveau HSK 3-4 sur le thème "${TOPIC}"`,
  },
  finance: {
    file: "data/finance.json",
    key: "term",
    shape: `{ "term": "le concept", "explanation": "explication claire de 2-3 phrases en français" }`,
    brief: `des fiches de concepts de finance/comptabilité sur le thème "${TOPIC}"`,
  },
  dec: {
    file: "data/dec.json",
    key: "question",
    shape: `{ "question": "question de révision", "answer": "réponse synthétique et exacte en français" }`,
    brief: `des fiches de révision pour le DEC (expertise comptable française) sur le thème "${TOPIC}", en citant les normes (NEP, code de commerce) quand pertinent`,
  },
};

const cfg = SCHEMAS[TYPE];
if (!cfg) { console.error("TYPE invalide :", TYPE); process.exit(1); }

const prompt = `Génère ${COUNT} ${cfg.brief}.
Réponds UNIQUEMENT avec un tableau JSON valide, sans texte ni balises Markdown autour.
Chaque élément suit exactement ce format : ${cfg.shape}.`;

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${TOKEN}`,
  },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: "Tu es un générateur de fiches d'apprentissage rigoureux. Tu réponds toujours en JSON strict." },
      { role: "user", content: prompt },
    ],
  }),
});

if (!res.ok) {
  console.error(`Erreur API ${res.status} : ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
let text = data.choices?.[0]?.message?.content?.trim() || "";
text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

let cards;
try {
  cards = JSON.parse(text);
} catch {
  const m = text.match(/\[[\s\S]*\]/);
  cards = m ? JSON.parse(m[0]) : null;
}
if (!Array.isArray(cards)) { console.error("Réponse non exploitable :\n", text); process.exit(1); }

cards = cards.map((c) => ({ type: TYPE, ...c }));

const existing = existsSync(cfg.file) ? JSON.parse(readFileSync(cfg.file, "utf8")) : [];
const seen = new Set(existing.map((c) => (c[cfg.key] || "").toLowerCase()));
const fresh = cards.filter((c) => c[cfg.key] && !seen.has(String(c[cfg.key]).toLowerCase()));

const merged = [...fresh, ...existing];
writeFileSync(cfg.file, JSON.stringify(merged, null, 2) + "\n");
console.log(`✅ ${fresh.length} nouvelles cartes ajoutées à ${cfg.file} (total ${merged.length}).`);
