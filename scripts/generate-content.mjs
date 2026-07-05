// Génère des cartes (mandarin / finance / dec) via GitHub Models — gratuit,
// authentifié par le jeton intégré du workflow (GITHUB_TOKEN). Aucune clé à créer.
//
// Variables d'environnement attendues :
//   GITHUB_TOKEN  (fourni automatiquement par GitHub Actions)
//   TYPE          "mandarin" | "finance" | "dec" | "ia" | "histoire"
//   TOPIC         thème libre, ex. "vocabulaire de la banque"
//   COUNT         nombre de cartes à générer (défaut 10)
//
// ⚠️ Si l'API renvoie une erreur de modèle, vérifie l'ID du modèle sur
// https://github.com/marketplace/models et ajuste ENDPOINT / MODEL ci-dessous.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4o-mini";

// Mode auto : quand le workflow tourne sur planning (cron), aucun input n'est
// fourni → type + thème choisis par rotation. Les 5 types d'apprentissage sont
// couverts à tour de rôle sur les créneaux matin/midi/soir (les 6 types de l'app
// avec les actus, générées elles par fetch-news) ; le thème avance chaque jour.
const AUTO_TOPICS = {
  mandarin: [
    "la vie quotidienne", "les affaires et le commerce", "l'économie et la finance",
    "voyager en Chine", "la technologie et internet", "les médias et l'actualité",
    "la nourriture et les restaurants", "le travail et l'entreprise",
    "les émotions et les opinions", "la politique et la société",
  ],
  finance: [
    "l'analyse financière", "les marchés de capitaux", "la comptabilité approfondie",
    "l'évaluation d'entreprise", "la gestion des risques", "les normes IFRS",
    "la finance d'entreprise", "les produits dérivés",
    "la trésorerie et le financement", "la fiscalité des entreprises",
  ],
  dec: [
    "les normes d'audit NEP", "le contrôle interne",
    "la déontologie du commissaire aux comptes", "l'audit des comptes consolidés",
    "le droit des sociétés", "les procédures d'audit",
    "la révélation des faits délictueux", "l'évaluation des risques d'audit",
    "les rapports du commissaire aux comptes", "le commissariat aux apports",
  ],
  ia: [
    "les architectures de modèles (Transformer, diffusion)", "l'économie de l'IA et le calcul",
    "les grands acteurs de l'IA", "les concepts d'apprentissage automatique",
    "l'IA générative et les LLM", "les semi-conducteurs et le matériel",
    "l'éthique et la régulation de l'IA", "les applications de l'IA en entreprise",
    "l'histoire et les jalons de l'IA", "l'IA et la cybersécurité",
  ],
  histoire: [
    "l'histoire économique mondiale", "l'histoire des crises financières",
    "la géopolitique du XXe siècle", "les grandes innovations et révolutions industrielles",
    "l'histoire de la Chine moderne", "l'histoire monétaire et des banques centrales",
    "la mondialisation et le commerce", "l'histoire de l'Europe et de sa construction",
    "les empires et les routes commerciales", "l'histoire des idées économiques",
  ],
};
const TYPES = ["mandarin", "finance", "dec", "ia", "histoire"];

function autoPick() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 864e5);
  const h = now.getUTCHours();
  const hourSlot = h < 9 ? 0 : h < 15 ? 1 : 2;   // matin / midi / soir
  const slot = dayOfYear * 3 + hourSlot;
  const type = TYPES[slot % TYPES.length];        // rotation sur les 5 types
  const pool = AUTO_TOPICS[type];
  return { type, topic: pool[slot % pool.length] };
}

const AUTO = !process.env.TYPE;
const picked = AUTO ? autoPick() : {};
const TYPE = process.env.TYPE || picked.type;
const TOPIC = process.env.TOPIC || picked.topic || "notions générales";
const COUNT = parseInt(process.env.COUNT, 10) || (AUTO ? 6 : 10);
const TOKEN = process.env.GITHUB_TOKEN;

if (AUTO) console.log(`🔁 Mode auto → ${TYPE} / « ${TOPIC} » (${COUNT} cartes)`);
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
  ia: {
    file: "data/ia.json",
    key: "term",
    shape: `{ "term": "le concept ou l'acteur", "explanation": "explication dense et exacte de 2-3 phrases en français, compréhensible sans contexte" }`,
    brief: `des fiches sur l'intelligence artificielle et la tech sur le thème "${TOPIC}", niveau professionnel curieux (concepts, acteurs, enjeux économiques)`,
  },
  histoire: {
    file: "data/histoire.json",
    key: "question",
    shape: `{ "question": "question d'histoire (économie, géopolitique, innovation)", "answer": "réponse claire et exacte de 2-3 phrases en français, avec dates clés" }`,
    brief: `des fiches d'histoire (économique, géopolitique, grandes innovations, Chine) sur le thème "${TOPIC}", autonomes et précises`,
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
