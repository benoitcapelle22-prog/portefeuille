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

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  let name: string | null = null;
  let sector: string | null = null;
  let yahooSymbol = q;

  try {
    // ── 1. Search : nom + symbole Yahoo exact ─────────────────────
    const searchRes = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=5&newsCount=0`
    );
    if (searchRes?.ok) {
      const searchData = await searchRes.json();
      const quotes: any[] = searchData?.quotes ?? [];
      const exact = quotes.find(item => item.symbol?.toUpperCase() === q);
      const best = exact ?? quotes[0];
      name = best?.longname ?? best?.shortname ?? null;
      yahooSymbol = best?.symbol ?? q;
      // Secteur parfois présent directement dans la recherche
      sector = best?.sector ?? null;
    }

    // ── 2. v7/finance/quote : secteur direct (sans auth) ─────────
    if (!sector) {
      const quoteRes = await fetchWithTimeout(
        `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}&fields=sector,longName,shortName`
      );
      if (quoteRes?.ok) {
        const quoteData = await quoteRes.json();
        const item = quoteData?.quoteResponse?.result?.[0];
        sector = item?.sector ?? null;
        if (!name) name = item?.longName ?? item?.shortName ?? null;
      }
    }

    // ── 3. quoteSummary assetProfile : fallback ───────────────────
    if (!sector) {
      for (const base of ["query2", "query1"]) {
        const summaryRes = await fetchWithTimeout(
          `https://${base}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile&lang=en-US&region=US`
        );
        if (summaryRes?.ok) {
          const summaryData = await summaryRes.json();
          sector = summaryData?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? null;
          if (sector) break;
        } else {
          console.warn(`quoteSummary ${summaryRes?.status} for ${yahooSymbol} via ${base}`);
        }
      }
    }

    console.log(`yahoo-search ${q}: name=${name} sector=${sector}`);

    const result: SearchResult = { symbol: q, name, sector };
    if (name) resultCache.set(q, { result, expiresAt: now + CACHE_TTL_MS });

    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(result);
  } catch (e: any) {
    console.error(`yahoo-search error for ${q}:`, e?.message);
    res.status(200).json({ symbol: q, name, sector });
  }
}
