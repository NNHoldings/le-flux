// P3 — Synthèse « L'essentiel du jour » : condense les titres du jour en 3 points
// clés via GitHub Models, écrits en tête de data/news.json.
//
// NE DOIT JAMAIS faire échouer le workflow : toute erreur (pas de token, rate
// limit, réponse illisible) est loggée et ignorée — les actus brutes suffisent.
//
// Variables d'env : GITHUB_TOKEN (fourni par Actions). Model : voir ENDPOINT/MODEL.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const FILE = "data/news.json";

async function main() {
  const TOKEN = process.env.GITHUB_TOKEN;
  if (!TOKEN) { console.warn("ℹ️  Pas de GITHUB_TOKEN — synthèse ignorée."); return; }
  if (!existsSync(FILE)) { console.warn("ℹ️  news.json absent — synthèse ignorée."); return; }

  let news = JSON.parse(readFileSync(FILE, "utf8"));
  if (!Array.isArray(news)) { console.warn("ℹ️  news.json invalide — synthèse ignorée."); return; }

  // Retire l'ancienne carte essentiel avant d'en régénérer une.
  news = news.filter((c) => !c.essential);

  const headlines = news.slice(0, 15).map((n, i) => `${i + 1}. ${n.title}`).join("\n");
  if (!headlines.trim()) { console.warn("ℹ️  Aucune actu — synthèse ignorée."); return; }

  const prompt =
    `Voici les titres d'actualité économique et géopolitique du jour :\n${headlines}\n\n` +
    `Synthétise en EXACTEMENT 3 points clés (une phrase courte chacun, en français) ` +
    `ce qu'il faut retenir aujourd'hui. Réponds UNIQUEMENT avec un tableau JSON de 3 ` +
    `chaînes de caractères, sans texte ni Markdown autour.`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TOKEN}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: "Tu es un rédacteur en chef concis. Tu réponds toujours en JSON strict." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) { console.warn(`ℹ️  API ${res.status} — synthèse ignorée.`); return; }

  const data = await res.json();
  let text = (data.choices?.[0]?.message?.content || "").trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  let bullets;
  try { bullets = JSON.parse(text); }
  catch { const m = text.match(/\[[\s\S]*\]/); bullets = m ? JSON.parse(m[0]) : null; }

  bullets = Array.isArray(bullets)
    ? bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (bullets.length < 2) { console.warn("ℹ️  Synthèse illisible — ignorée."); return; }

  const card = {
    type: "news",
    essential: true,
    title: "L'essentiel du jour",
    bullets,
    source: "Le Flux",
    date: new Date().toISOString().slice(0, 10),
  };

  writeFileSync(FILE, JSON.stringify([card, ...news], null, 2) + "\n");
  console.log(`✅ Carte « L'essentiel » ajoutée (${bullets.length} points).`);
}

main().catch((e) => console.warn("ℹ️  Synthèse ignorée :", e.message));
