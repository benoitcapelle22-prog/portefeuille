export type Quote = {
  symbol: string;
  price: number | null;
  currency: string | null;
  timestamp: string | null;
  source: "alphavantage";
};

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const params = new URLSearchParams({ symbols: symbols.join(",") });
  const res = await fetch(`/api/quotes?${params.toString()}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Quotes API failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data?.quotes ?? []) as Quote[];
}