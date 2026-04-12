import type { VercelRequest, VercelResponse } from "@vercel/node";

type SearchResult = {
  symbol: string;
  name: string | null;
  sector: string | null;
};

const resultCache = new Map<string, { result: SearchResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchSector(symbol: string): Promise<string | null> {
  // Liste d'endpoints à essayer dans l'ordre
  const urls = [
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&lang=en-US&region=US`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&lang=en-US&region=US`,
    `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&lang=en-US&region=US`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`quoteSummary ${res.status} for ${symbol} at ${url}`);
        continue;
      }

      const data = await res.json();
      const sector: string | null = data?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? null;
      if (sector) return sector;
    } catch (e) {
      console.warn(`quoteSummary error for ${symbol}:`, e);
    }
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toUpperCase() : "";

  if (!q || q.length < 1) {
    res.status(400).json({ error: "Provide ?q=SYMBOL" });
    return;
  }

  const now = Date.now();
  const cached = resultCache.get(q);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(cached.result);
    return;
  }

  try {
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 6000);

    const searchUrl = `https://query1.finance.yahoo.com/v8/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=5&newsCount=0`;
    const searchRes = await fetch(searchUrl, { headers: HEADERS, signal: controller1.signal });
    clearTimeout(timeout1);

    if (!searchRes.ok) {
      res.status(200).json({ symbol: q, name: null, sector: null });
      return;
    }

    const searchData = await searchRes.json();
    const quotes: any[] = searchData?.quotes ?? [];
    const exact = quotes.find(item => item.symbol?.toUpperCase() === q);
    const best = exact ?? quotes[0];
    const name = best?.longname ?? best?.shortname ?? null;
    const yahooSymbol = best?.symbol ?? q;

    // Secteur : d'abord dans les résultats de recherche, sinon via quoteSummary
    const sectorFromSearch: string | null = best?.sector ?? null;
    const sector = sectorFromSearch ?? await fetchSector(yahooSymbol);

    const result: SearchResult = { symbol: q, name, sector };
    if (name) resultCache.set(q, { result, expiresAt: now + CACHE_TTL_MS });

    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(result);
  } catch (e: any) {
    console.error(`yahoo-search error for ${q}:`, e?.message);
    res.status(200).json({ symbol: q, name: null, sector: null });
  }
}
