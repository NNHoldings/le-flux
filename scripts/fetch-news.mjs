// Récupère les flux RSS et écrit data/news.json.
// Édite librement la liste FEEDS ci-dessous (titre + URL).
import { writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const FEEDS = [
  { source: "Le Monde Éco", url: "https://www.lemonde.fr/economie/rss_full.xml" },
  { source: "France Info Éco", url: "https://www.francetvinfo.fr/economie.rss" },
  { source: "Le Figaro Éco", url: "https://www.lefigaro.fr/rss/figaro_economie.xml" },
  { source: "BFM Éco", url: "https://www.bfmtv.com/rss/economie/" },
];

const MAX_ITEMS = 45;          // nombre max d'actus gardées
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
    const items = data?.rss?.channel?.item || data?.feed?.entry || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.map((it) => {
      const link = typeof it.link === "object" ? it.link["@_href"] || it.link["#text"] : it.link;
      return {
        type: "news",
        title: clean(it.title?.["#text"] || it.title),
        summary: truncate(clean(it.description || it.summary || it.content || ""), SUMMARY_LEN),
        source: feed.source,
        link: (link || "").trim(),
        date: (it.pubDate || it.published || it.updated || "").split("T")[0] || "",
      };
    }).filter((x) => x.title);
  } catch (e) {
    console.warn(`⚠️  ${feed.source} ignoré : ${e.message}`);
    return [];
  }
}

const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();

// Dédoublonnage par titre + tri (les plus récents d'abord si date dispo).
const seen = new Set();
const unique = all.filter((a) => {
  const k = a.title.toLowerCase();
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
unique.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

const out = unique.slice(0, MAX_ITEMS);
writeFileSync("data/news.json", JSON.stringify(out, null, 2) + "\n");
console.log(`✅ ${out.length} actus écrites dans data/news.json`);
