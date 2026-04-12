import type { VercelRequest, VercelResponse } from "@vercel/node";

type SearchResult = {
  symbol: string;
  name: string | null;
  sector: string | null;
};

const resultCache = new Map<string, { result: SearchResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Cache du crumb Yahoo Finance (valide ~55 min)
let crumbCache: { crumb: string; cookie: string; expiresAt: number } | null = null;

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  const now = Date.now();
  if (crumbCache && crumbCache.expiresAt > now) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie };
  }

  try {
    // Étape 1 : récupérer les cookies depuis la page principale
    const homeRes = await fetch("https://finance.yahoo.com/", {
      headers: { ...BASE_HEADERS, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
    });
    const cookie = homeRes.headers.get("set-cookie") ?? "";

    // Étape 2 : récupérer le crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...BASE_HEADERS, "Cookie": cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb) return null;

    crumbCache = { crumb, cookie, expiresAt: now + 55 * 60 * 1000 };
    return { crumb, cookie };
  } catch (e) {
    console.error("getYahooCrumb error:", e);
    return null;
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

  try {
    // Recherche du symbole
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 6000);

    const searchUrl = `https://query1.finance.yahoo.com/v8/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=5&newsCount=0`;
    const searchRes = await fetch(searchUrl, {
      headers: BASE_HEADERS,
      signal: controller1.signal,
    });
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

    // Récupération du secteur via assetProfile (avec crumb)
    let sector: string | null = null;
    try {
      const auth = await getYahooCrumb();
      const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile${crumbParam}`;

      const headers: Record<string, string> = { ...BASE_HEADERS };
      if (auth?.cookie) headers["Cookie"] = auth.cookie;

      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      const summaryRes = await fetch(summaryUrl, { headers, signal: controller2.signal });
      clearTimeout(timeout2);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        sector = summaryData?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? null;
      } else {
        console.error(`quoteSummary HTTP ${summaryRes.status} for ${yahooSymbol}`);
        if (summaryRes.status === 401 || summaryRes.status === 403) {
          crumbCache = null; // invalider le cache du crumb
        }
      }
    } catch (e) {
      console.error(`quoteSummary error for ${yahooSymbol}:`, e);
    }

    const result: SearchResult = { symbol: q, name, sector };
    if (name) resultCache.set(q, { result, expiresAt: now + CACHE_TTL_MS });

    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(result);
  } catch (e: any) {
    console.error(`yahoo-search error for ${q}:`, e?.message);
    res.status(200).json({ symbol: q, name: null, sector: null });
  }
}
