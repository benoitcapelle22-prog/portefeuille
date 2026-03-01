import type { VercelRequest, VercelResponse } from "@vercel/node";

type TickerInfo = {
  symbol: string;            // symbole côté app (ex: MC.PA)
  providerSymbol: string;    // symbole Marketstack (ex: MC.XPAR)
  name: string | null;
  exchangeMic: string | null;
  exchangeName: string | null;
  source: "marketstack";
};

function normSymbol(s: unknown) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

// Conversion simple pour Euronext Paris (comme pour tes quotes)
function toMarketstackSymbol(userSymbol: string) {
  if (userSymbol.endsWith(".PA")) return userSymbol.replace(/\.PA$/i, ".XPAR");
  return userSymbol;
}

async function fetchTickerBySymbol(msSymbol: string, apiKey: string) {
  const url = `https://api.marketstack.com/v1/tickers/${encodeURIComponent(msSymbol)}?access_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data ?? null;
}

async function searchTicker(msQuery: string, apiKey: string) {
  const url = `https://api.marketstack.com/v1/tickers?access_key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(msQuery)}&limit=5`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.MARKETSTACK_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing MARKETSTACK_API_KEY env var" });
      return;
    }

    const symbol = normSymbol(req.query.symbol);
    if (!symbol) {
      res.status(400).json({ error: "Provide symbol=..." });
      return;
    }

    const providerSymbol = toMarketstackSymbol(symbol);

    // 1) Essai direct /tickers/[symbol]
    let data = await fetchTickerBySymbol(providerSymbol, apiKey);

    // 2) Fallback: /tickers?search=...
    if (!data) {
      const list = await searchTicker(providerSymbol, apiKey);
      if (list?.length) {
        data =
          list.find((x: any) => String(x?.symbol ?? "").toUpperCase() === providerSymbol) ??
          list[0];
      }
    }

    const out: TickerInfo = {
      symbol,
      providerSymbol,
      name: typeof data?.name === "string" ? data.name : null,
      exchangeMic: typeof data?.stock_exchange?.mic === "string" ? data.stock_exchange.mic : null,
      exchangeName: typeof data?.stock_exchange?.name === "string" ? data.stock_exchange.name : null,
      source: "marketstack",
    };

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(out);
  } catch (e: any) {
    res.status(500).json({ error: "Server error", details: String(e?.message ?? e) });
  }
}