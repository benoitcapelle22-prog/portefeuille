export type Quote = {
  symbol: string;
  price: number | null;
  currency: string | null;
  timestamp: string | null;
  source: "yahoo";
};

async function fetchYahooQuote(symbol: string): Promise<Quote> {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  // En développement, passe par le proxy Vite pour éviter CORS
  const url = import.meta.env.DEV
    ? `/yahoo-proxy/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    : yahooUrl;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo Finance error (${res.status}) for ${symbol}`);

  const data = await res.json();
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