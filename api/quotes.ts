import type { VercelRequest, VercelResponse } from "@vercel/node";

type Quote = {
  symbol: string;
  price: number | null;
  currency: string | null;
  timestamp: string | null; // best effort
  source: "alphavantage";
};

const cache = new Map<string, { quote: Quote; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60s

function parseSymbols(input: unknown): string[] {
  const raw = typeof input === "string" ? input : "";
  return raw
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 25); // évite les abus
}

async function fetchGlobalQuote(symbol: string, apiKey: string): Promise<Quote> {
  const url =
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) {
    return { symbol, price: null, currency: null, timestamp: null, source: "alphavantage" };
  }

  const data = await res.json();

  // Gestion des erreurs Alpha Vantage (quota, erreurs, etc.)
  if (data?.Note || data?.Information || data?.Error_Message) {
    return { symbol, price: null, currency: null, timestamp: null, source: "alphavantage" };
  }

  const q = data?.["Global Quote"];
  const priceStr = q?.["05. price"];
  const ts = q?.["07. latest trading day"] ?? null;

  const price = typeof priceStr === "string" ? Number(priceStr) : null;

  return {
    symbol,
    price: Number.isFinite(price) ? price : null,
    currency: null, // Alpha Vantage ne renvoie pas toujours la devise ici
    timestamp: ts,
    source: "alphavantage",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing ALPHAVANTAGE_API_KEY env var" });
      return;
    }

    const symbols = parseSymbols(req.query.symbols);
    if (symbols.length === 0) {
      res.status(400).json({ error: "Provide symbols=AAA,BBB" });
      return;
    }

    // Cache: si un symbole est encore “fresh”, on le renvoie sans appeler Alpha Vantage
    const now = Date.now();
    const results: Quote[] = [];

    for (const sym of symbols) {
      const cached = cache.get(sym);
      if (cached && cached.expiresAt > now) {
        results.push(cached.quote);
        continue;
      }

      const quote = await fetchGlobalQuote(sym, apiKey);
      cache.set(sym, { quote, expiresAt: now + CACHE_TTL_MS });
      results.push(quote);
    }

    // Cache HTTP (utile pour edge/CDN, même si la réponse dépend des symboles)
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ quotes: results });
  } catch (e: any) {
    res.status(500).json({ error: "Server error", details: String(e?.message ?? e) });
  }
}