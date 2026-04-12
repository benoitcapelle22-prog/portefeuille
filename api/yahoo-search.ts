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
  "Accept": "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers: HEADERS, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Nom via Yahoo Finance chart (même endpoint que ticker.ts — fonctionne sans auth)
async function fetchNameFromChart(symbol: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  );
  if (!res?.ok) return null;
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  return meta?.longName ?? meta?.shortName ?? null;
}

// Secteur via Alpha Vantage (clé gratuite : alphavantage.co)
async function fetchSectorFromAlphaVantage(symbol: string): Promise<{ name: string | null; sector: string | null }> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return { name: null, sector: null };

  const res = await fetchWithTimeout(
    `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  );
  if (!res?.ok) return { name: null, sector: null };
  const data = await res.json();

  // Alpha Vantage retourne `{"Information": "..."}` si quota dépassé
  if (data?.Information || data?.Note) {
    console.warn("Alpha Vantage quota dépassé ou note:", data.Information ?? data.Note);
    return { name: null, sector: null };
  }

  return {
    name: data?.Name ?? null,
    sector: data?.Sector ?? null,
  };
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

  // Appels en parallèle : chart Yahoo (nom) + Alpha Vantage (nom + secteur)
  const [chartName, avData] = await Promise.all([
    fetchNameFromChart(q),
    fetchSectorFromAlphaVantage(q),
  ]);

  const name = avData.name ?? chartName;
  const sector = avData.sector ?? null;

  console.log(`yahoo-search ${q}: name=${name} sector=${sector}`);

  const result: SearchResult = { symbol: q, name, sector };
  if (name) resultCache.set(q, { result, expiresAt: now + CACHE_TTL_MS });

  res.setHeader("Cache-Control", "s-maxage=86400");
  res.status(200).json(result);
}
