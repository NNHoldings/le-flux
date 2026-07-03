// Récupère les flux RSS et écrit data/news.json.
// Édite librement la liste FEEDS ci-dessous (titre + URL).
import { writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

// Sources volontairement diverses : éco FR, géopolitique / monde, finance &
// marchés, tech, Europe, Moyen-Orient — en français ET en anglais.
const FEEDS = [
  // — Économie & France —
  { source: "Le Monde Éco", url: "https://www.lemonde.fr/economie/rss_full.xml" },
  { source: "France Info Éco", url: "https://www.francetvinfo.fr/economie.rss" },
  { source: "Le Figaro Éco", url: "https://www.lefigaro.fr/rss/figaro_economie.xml" },
  // — Monde & géopolitique (FR) —
  { source: "Le Monde International", url: "https://www.lemonde.fr/international/rss_full.xml" },
  { source: "RFI Monde", url: "https://www.rfi.fr/fr/monde/rss" },
  { source: "Courrier International", url: "https://www.courrierinternational.com/feed/all/rss.xml" },
  // — Monde & géopolitique (EN) —
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
  { source: "DW (Europe)", url: "https://rss.dw.com/rdf/rss-en-all" },
  { source: "Politico EU", url: "https://www.politico.eu/feed/" },
  // — Finance & marchés (EN) —
  { source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "The Economist — Finance", url: "https://www.economist.com/finance-and-economics/rss.xml" },
  { source: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  // — Tech & innovation (EN) —
  { source: "Hacker News", url: "https://hnrss.org/frontpage" },
  { source: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
];

const MAX_ITEMS = 90;          // nombre max d'actus gardées (toutes sources confondues)
const PER_FEED = 10;           // plafond par source → garantit la diversité
const SUMMARY_LEN = 240;       // longueur max du résumé

const parser = new XMLParser({ ignoreAttributes: false });

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ugrave: "ù", ocirc: "ô", euml: "ë" };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name] ?? NAMED[name.toLowerCase()] ?? m);
}

function clean(html = "") {
  return decodeEntities(
    String(html)
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// Normalise une date de flux (RFC822, ISO, dc:date…) en YYYY-MM-DD, sinon "".
function normDate(raw) {
  if (!raw) return "";
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
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
    // RSS 2.0 (rss.channel.item), Atom (feed.entry) ou RDF/RSS 1.0 (rdf:RDF.item, ex. DW).
    const items = data?.rss?.channel?.item || data?.feed?.entry || data?.["rdf:RDF"]?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.map((it) => {
      const rawLink = Array.isArray(it.link) ? it.link[0] : it.link;
      const link = typeof rawLink === "object" ? rawLink["@_href"] || rawLink["#text"] : rawLink;
      return {
        type: "news",
        title: clean(it.title?.["#text"] || it.title),
        summary: truncate(clean(it.description || it.summary || it.content || it["content:encoded"] || ""), SUMMARY_LEN),
        source: feed.source,
        link: (link || "").trim(),
        date: normDate(it.pubDate || it.published || it.updated || it["dc:date"] || ""),
      };
    }).filter((x) => x.title).slice(0, PER_FEED);
  } catch (e) {
    console.warn(`⚠️  ${feed.source} ignoré : ${e.message}`);
    return [];
  }
}

// Un tableau d'actus par source (chacun déjà trié du plus récent, plafonné).
const perFeed = await Promise.all(FEEDS.map(fetchFeed));

// Dédoublonnage global par titre.
const seen = new Set();
for (const list of perFeed) {
  for (let i = list.length - 1; i >= 0; i--) {
    const k = list[i].title.toLowerCase();
    if (seen.has(k)) list.splice(i, 1);
    else seen.add(k);
  }
}

// Entrelacement round-robin : chaque source contribue à tour de rôle
// → diversité garantie même quand une source est très prolifique.
const out = [];
const lists = perFeed.filter((l) => l.length);
for (let round = 0; out.length < MAX_ITEMS && lists.some((l) => l.length); round++) {
  for (const list of lists) {
    if (round < list.length) {
      out.push(list[round]);
      if (out.length >= MAX_ITEMS) break;
    }
  }
}

writeFileSync("data/news.json", JSON.stringify(out, null, 2) + "\n");
const bySource = out.reduce((m, x) => ((m[x.source] = (m[x.source] || 0) + 1), m), {});
console.log(`✅ ${out.length} actus écrites (${Object.keys(bySource).length} sources).`);
