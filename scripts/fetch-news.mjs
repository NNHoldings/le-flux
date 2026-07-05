// Récupère les flux RSS, score la pertinence, écrit data/news.json.
// Objectif : des actus à haute valeur (macro, marchés, géopolitique, énergie,
// défense, innovation, IA, science) — pas de faits divers.
import { writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

// Sources sélectionnées pour leur valeur intellectuelle (FR + EN). Un flux qui
// tombe est simplement ignoré (jamais de crash). Le scoring filtre le bruit.
const FEEDS = [
  // Macro / marchés / banques centrales
  { source: "The Economist — Finance", url: "https://www.economist.com/finance-and-economics/rss.xml" },
  { source: "BCE (banques centrales)", url: "https://www.ecb.europa.eu/rss/press.html" },
  { source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  { source: "Google Actualités — Éco", url: "https://news.google.com/rss/search?q=(%C3%A9conomie%20OR%20march%C3%A9s%20OR%20inflation%20OR%20%22banque%20centrale%22)%20when:2d&hl=fr&gl=FR&ceid=FR:fr" },
  // Géopolitique / relations internationales
  { source: "Le Monde International", url: "https://www.lemonde.fr/international/rss_full.xml" },
  { source: "Le Monde Diplomatique", url: "https://www.monde-diplomatique.fr/rss" },
  { source: "Project Syndicate", url: "https://www.project-syndicate.org/rss" },
  { source: "Courrier International", url: "https://www.courrierinternational.com/feed/all/rss.xml" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "Politico EU", url: "https://www.politico.eu/feed/" },
  { source: "RFI Monde", url: "https://www.rfi.fr/fr/monde/rss" },
  // Éco France
  { source: "Le Monde Éco", url: "https://www.lemonde.fr/economie/rss_full.xml" },
  // Innovation / IA / tech
  { source: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { source: "MIT Sloan Review", url: "https://sloanreview.mit.edu/feed/" },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { source: "Hacker News", url: "https://hnrss.org/frontpage?points=150" },
  // Science
  { source: "Nature", url: "https://www.nature.com/nature.rss" },
];

const MAX_ITEMS = 48;          // total gardé (mieux vaut 48 excellents que 90 moyens)
const PER_FEED = 6;            // plafond par source (diversité)
const SUMMARY_LEN = 360;       // résumés plus riches (2-4 phrases quand dispo)

// Mots-clés de valeur (FR + EN). Un item sans aucun mot-clé est écarté ;
// le score sert aussi à classer les items d'un même flux.
const KEYWORDS = [
  // macro / marchés / finance
  "économie", "economy", "economic", "inflation", "taux", "interest rate", "central bank",
  "banque centrale", "fed", "bce", "ecb", "monetary", "récession", "recession", "croissance",
  "growth", "pib", "gdp", "dette", "debt", "déficit", "deficit", "budget", "bourse", "marché",
  "market", "stocks", "actions", "bond", "obligation", "yield", "trader", "wall street",
  "earnings", "résultats", "profit", "revenue", "valuation", "ipo", "merger", "acquisition",
  "fusion", "m&a", "investissement", "investment", "fund", "private equity", "venture", "capital",
  "startup", "banque", "bank", "crédit", "monnaie", "currency", "dollar", "euro", "commodities",
  // énergie / défense
  "énergie", "energy", "pétrole", "oil", "gaz", "gas", "nucléaire", "nuclear", "électricité",
  "défense", "defense", "defence", "military", "militaire", "armement", "weapons", "otan", "nato",
  // géopolitique
  "géopolitique", "geopolitics", "guerre", "war", "conflit", "conflict", "diplomatie", "diplomacy",
  "sanctions", "traité", "treaty", "élection", "election", "chine", "china", "russie", "russia",
  "ukraine", "états-unis", "united states", "europe", "afrique", "africa", "moyen-orient",
  "middle east", "inde", "india", "souveraineté", "trade", "commerce", "tariff", "droits de douane",
  // innovation / IA / tech
  "ia", "ai", "intelligence artificielle", "artificial intelligence", "machine learning",
  "algorithm", "algorithme", "semiconductor", "semi-conducteur", "chip", "puce", "quantum",
  "quantique", "technologie", "technology", "innovation", "software", "cloud", "data", "données",
  "cyber", "robot", "nvidia", "openai", "startup",
  // science
  "science", "recherche", "research", "study", "étude", "découverte", "discovery", "climat",
  "climate", "espace", "space", "physique", "physics", "biologie", "biology", "génome", "genome",
  "médecine", "medicine", "énergie",
];

const parser = new XMLParser({ ignoreAttributes: false });

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ugrave: "ù", ocirc: "ô", euml: "ë", rsquo: "’", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–" };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name] ?? NAMED[name.toLowerCase()] ?? m);
}

function clean(html = "") {
  return decodeEntities(
    String(html).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
}

function truncate(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const lastDot = cut.lastIndexOf(". ");
  return (lastDot > n * 0.5 ? cut.slice(0, lastDot + 1) : cut.trimEnd() + "…");
}

// Nettoie les titres Google News (« Titre - Média »).
function cleanTitle(t) {
  return clean(t).replace(/\s+-\s+[^-]{2,40}$/u, "").trim();
}

function normDate(raw) {
  if (!raw) return "";
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

function relevance(title, summary) {
  const hay = (title + " " + summary).toLowerCase();
  const titleLow = title.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS) {
    if (titleLow.includes(kw)) score += 2;
    else if (hay.includes(kw)) score += 1;
  }
  return score;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml = await res.text();
    const data = parser.parse(xml);
    const items = data?.rss?.channel?.item || data?.feed?.entry || data?.["rdf:RDF"]?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.map((it) => {
      const rawLink = Array.isArray(it.link) ? it.link[0] : it.link;
      const link = typeof rawLink === "object" ? rawLink["@_href"] || rawLink["#text"] : rawLink;
      const title = cleanTitle(it.title?.["#text"] || it.title);
      const summary = truncate(clean(it["content:encoded"] || it.description || it.summary || it.content || ""), SUMMARY_LEN);
      return {
        type: "news",
        title,
        summary,
        source: feed.source,
        link: String(link || "").trim(),
        date: normDate(it.pubDate || it.published || it.updated || it["dc:date"] || ""),
        score: relevance(title, summary),
      };
    })
      .filter((x) => x.title && x.score >= 1)     // écarte les items hors-thème
      .sort((a, b) => b.score - a.score)          // meilleurs d'abord
      .slice(0, PER_FEED);
  } catch (e) {
    console.warn(`⚠️  ${feed.source} ignoré : ${e.message}`);
    return [];
  }
}

const perFeed = await Promise.all(FEEDS.map(fetchFeed));

// Dédoublonnage global par titre normalisé.
const seen = new Set();
for (const list of perFeed) {
  for (let i = list.length - 1; i >= 0; i--) {
    const k = list[i].title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(k)) list.splice(i, 1);
    else seen.add(k);
  }
}

// Round-robin : chaque source contribue à tour de rôle (diversité garantie).
const out = [];
const lists = perFeed.filter((l) => l.length);
for (let round = 0; out.length < MAX_ITEMS && lists.some((l) => l.length); round++) {
  for (const list of lists) {
    if (round < list.length) {
      const item = { ...list[round] };
      delete item.score;                          // le score ne sert qu'au tri
      out.push(item);
      if (out.length >= MAX_ITEMS) break;
    }
  }
}

writeFileSync("data/news.json", JSON.stringify(out, null, 2) + "\n");
const bySource = out.reduce((m, x) => ((m[x.source] = (m[x.source] || 0) + 1), m), {});
console.log(`✅ ${out.length} actus écrites (${Object.keys(bySource).length} sources).`);
