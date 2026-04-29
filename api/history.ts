type VercelRequest = { query: Record<string, string | string[] | undefined> };
type VercelResponse = { status(c: number): VercelResponse; json(b: unknown): void; setHeader(k: string, v: string): void };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  try {
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to   = typeof req.query.to   === "string" ? req.query.to   : null;
    const query = from && to
      ? `interval=1d&period1=${Math.floor(new Date(from).getTime() / 1000)}&period2=${Math.floor(new Date(to).getTime() / 1000) + 86400}`
      : `interval=1d&range=5y`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
        "Referer": "https://finance.yahoo.com/",
      },
    });

    if (!response.ok) return res.status(200).json({ prices: [] });

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(200).json({ prices: [] });

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const prices = timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().split("T")[0], close: closes[i] }))
      .filter((p): p is { date: string; close: number } =>
        p.close !== null && p.close !== undefined && Number.isFinite(p.close)
      );

    res.setHeader("Cache-Control", "s-maxage=3600");
    return res.status(200).json({ prices });
  } catch (e: any) {
    console.error(`history error for ${symbol}:`, e?.message);
    return res.status(200).json({ prices: [] });
  }
}
