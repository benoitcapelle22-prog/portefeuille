import type { VercelRequest, VercelResponse } from "@vercel/node";

type Quote = {
  symbol: string;
  price: number | null;
  currency: string | null;
  timestamp: string | null;
  source: "fmp" | "marketstack";
};

const cache = new Map<string, { quote: Quote; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60s

function parseSymbols(input: unknown): string[] {
  const raw = typeof input === "string" ? input : "";
  return raw
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

// Détecte si le symbole est européen (contient un point)
function isEuropean(symbol: string): boolean {
  return symbol.includes(".");
}

// Convertit .PA → .XPAR, .DE → .XETR, etc.
function toMarketstackSymbol(symbol: string): string {
  const suffixMap: Record<string, string> = {
    ".PA": ".XPAR",   // Euronext Paris
    ".DE": ".XETR",   // Deutsche Börse
    ".L":  ".XLON",   // London Stock Exchange
    ".MI": ".XMIL",   // Borsa Italiana
    ".MC": ".XMAD",   // Bolsa de Madrid
    ".AS": ".XAMS",   // Euronext Amsterdam
    ".BR": ".XBRU",   // Euronext Bruxelles
    ".LS": ".XLIS",   // Euronext Lisbonne
    ".SW": ".XSWX",   // SIX Swiss Exchange
    ".HE": ".XHEL",   // Nasdaq Helsinki
    ".ST": ".XSTO",   // Nasdaq Stockholm
    ".CO": ".XCSE",   // Nasdaq Copenhague
    ".OL": ".XOSL",   // Oslo Børs
  };

  for (const [suffix, exchange] of Object.entries(suffixMap)) {
    if (symbol.endsWith(suffix)) {
      return symbol.replace(suffix, exchange);
    }
  }

  // Fallback : garder le symbole tel quel
  return symbol;
}

// Fetch via FMP (actions US)
async function fetchFMP(symbol: string, apiKey: string): Promise<Quote> {
  try {
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { symbol, price: null, currency: null, timestamp: null, source: "fmp" };

    const data = await response.json();
    const fmp = Array.isArray(data) ? data[0] : null;

    return {
      symbol,
      price: fmp?.price != null ? Number(fmp.price) : null,
      currency: fmp?.currency ?? "USD",
      timestamp: fmp?.timestamp
        ? new Date(fmp.timestamp * 1000).toISOString().split("T")[0]
        : null,
      source: "fmp",
    };
  } catch {
    return { symbol, price: null, currency: null, timestamp: null, source: "fmp" };
  }
}

// Fetch via Marketstack (actions européennes)
async function fetchMarketstack(symbol: string, apiKey: string): Promise<Quote> {
  try {
    const msSymbol = toMarketstackSymbol(symbol);
    const url = `http://api.marketstack.com/v1/eod/latest?access_key=${apiKey}&symbols=${msSymbol}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { symbol, price: null, currency: null, timestamp: null, source: "marketstack" };

    const data = await response.json();
    const item = data?.data?.[0] ?? null;

    return {
      symbol,
      price: item?.close != null ? Number(item.close) : null,
      currency: "EUR", // Euronext = EUR par défaut
      timestamp: item?.date ? item.date.split("T")[0] : null,
      source: "marketstack",
    };
  } catch {
    return { symbol, price: null, currency: null, timestamp: null, source: "marketstack" };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fmpKey = process.env.FMP_API_KEY;
    const msKey = process.env.MARKETSTACK_API_KEY;

    if (!fmpKey && !msKey) {
      res.status(500).json({ error: "Missing FMP_API_KEY and MARKETSTACK_API_KEY env vars" });
      return;
    }

    const symbols = parseSymbols(req.query.symbols);
    if (symbols.length === 0) {
      res.status(400).json({ error: "Provide symbols=AAA,BBB" });
      return;
    }

    const now = Date.now();
    const toFetch: string[] = [];
    const cachedResults: Quote[] = [];

    for (const sym of symbols) {
      const cached = cache.get(sym);
      if (cached && cached.expiresAt > now) {
        cachedResults.push(cached.quote);
      } else {
        toFetch.push(sym);
      }
    }

    // Fetch en parallèle avec le bon provider selon le type de symbole
    const fetchedResults = await Promise.all(
      toFetch.map(sym => {
        if (isEuropean(sym) && msKey) return fetchMarketstack(sym, msKey);
        if (!isEuropean(sym) && fmpKey) return fetchFMP(sym, fmpKey);
        // Fallback si une clé manque
        if (fmpKey) return fetchFMP(sym, fmpKey);
        return fetchMarketstack(sym, msKey!);
      })
    );

    // Mise en cache
    for (const quote of fetchedResults) {
      cache.set(quote.symbol, { quote, expiresAt: now + CACHE_TTL_MS });
    }

    const allResults = [...cachedResults, ...fetchedResults];

    // Remettre dans l'ordre des symboles demandés
    const ordered = symbols.map(sym =>
      allResults.find(r => r.symbol === sym) ?? {
        symbol: sym, price: null, currency: null, timestamp: null, source: "fmp" as const
      }
    );

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ quotes: ordered });
  } catch (e: any) {
    res.status(500).json({ error: "Server error", details: String(e?.message ?? e) });
  }
}