export type Quote = {
  symbol: string;
  price: number | null;
  currency: string | null;
  timestamp: string | null;
  source: "yahoo";
};

async function fetchYahooQuote(symbol: string): Promise<Quote> {
  // En dev : proxy Vite, en prod : notre serverless /api/ticker
  const url = import.meta.env.DEV
    ? `/yahoo-proxy/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    : `/api/ticker?symbol=${encodeURIComponent(symbol)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quote error (${res.status}) for ${symbol}`);

  const data = await res.json();

  if (import.meta.env.DEV) {
    // Réponse brute Yahoo
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error(`No data for ${symbol}`);
    return {
      symbol: symbol.toUpperCase(),
      price: meta.regularMarketPrice ?? null,
      currency: meta.currency ?? null,
      timestamp: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null,
      source: "yahoo",
    };
  } else {
    // Réponse de /api/ticker : { name, currency, exchange, price }
    return {
      symbol: symbol.toUpperCase(),
      price: data.price ?? null,
      currency: data.currency ?? null,
      timestamp: null,
      source: "yahoo",
    };
  }
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.allSettled(symbols.map(fetchYahooQuote));

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`Failed to fetch ${symbols[i]}:`, r.reason);
    return {
      symbol: symbols[i].toUpperCase(),
      price: null,
      currency: null,
      timestamp: null,
      source: "yahoo" as const,
    };
  });
}