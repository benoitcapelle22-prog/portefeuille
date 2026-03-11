import type { VercelRequest, VercelResponse } from "@vercel/node";

const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";

  if (!symbol) {
    res.status(400).json({ error: "Missing symbol" });
    return;
  }

  const now = Date.now();
  const cached = cache.get(symbol);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "s-maxage=300");
    res.status(200).json(cached.data);
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
          "Referer": "https://finance.yahoo.com/",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(200).json({ name: null, currency: null, exchange: null, price: null });
      return;
    }

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) {
      res.status(200).json({ name: null, currency: null, exchange: null, price: null });
      return;
    }

    const result = {
      name: meta.longName || meta.shortName || null,
      currency: meta.currency || null,
      exchange: meta.exchangeName || null,
      price: meta.regularMarketPrice ?? null,
    };

    cache.set(symbol, { data: result, expiresAt: now + CACHE_TTL_MS });
    res.setHeader("Cache-Control", "s-maxage=300");
    res.status(200).json(result);

  } catch (e: any) {
    console.error(`ticker error for ${symbol}:`, e?.message);
    res.status(200).json({ name: null, currency: null, exchange: null, price: null });
  }
}