import type { VercelRequest, VercelResponse } from "@vercel/node";

type SearchResult = {
  symbol: string;
  name: string | null;
  sector: string | null;
};

const cache = new Map<string, { result: SearchResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toUpperCase() : "";

  if (!q || q.length < 1) {
    res.status(400).json({ error: "Provide ?q=SYMBOL" });
    return;
  }

  // Cache
  const now = Date.now();
  const cached = cache.get(q);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(cached.result);
    return;
  }

  try {
    // Étape 1 : autocomplete Yahoo Finance v8
    const searchUrl = `https://query1.finance.yahoo.com/v8/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=5&newsCount=0`;

    const searchRes = await fetch(searchUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6000),
    });

    if (!searchRes.ok) {
      console.error(`Yahoo search HTTP ${searchRes.status} for ${q}`);
      res.status(200).json({ symbol: q, name: null, sector: null });
      return;
    }

    const searchData = await searchRes.json();
    const quotes: any[] = searchData?.quotes ?? [];

    // Correspondance exacte sur le symbole
    const exact = quotes.find(item => item.symbol?.toUpperCase() === q);
    const best = exact ?? quotes[0];
    const name = best?.longname ?? best?.shortname ?? null;
    const yahooSymbol = best?.symbol ?? q;

    // Étape 2 : secteur via quoteSummary v10
    let sector: string | null = null;
    try {
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile&corsDomain=finance.yahoo.com`;
      const summaryRes = await fetch(summaryUrl, {
        headers: HEADERS,
        signal: AbortSignal.timeout(6000),
      });

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        sector = summaryData?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? null;
      } else {
        console.error(`Yahoo quoteSummary HTTP ${summaryRes.status} for ${yahooSymbol}`);
      }
    } catch (e) {
      console.error(`Yahoo quoteSummary error for ${yahooSymbol}:`, e);
    }

    const result: SearchResult = { symbol: q, name, sector };
    if (name) cache.set(q, { result, expiresAt: now + CACHE_TTL_MS });

    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(result);
  } catch (e: any) {
    console.error(`yahoo-search error for ${q}:`, e?.message);
    res.status(200).json({ symbol: q, name: null, sector: null });
  }
}