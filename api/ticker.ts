export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), { status: 400 });
  }

  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

    const response = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Symbol not found" }), { status: 404 });
    }

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) {
      return new Response(JSON.stringify({ error: "No data found" }), { status: 404 });
    }

    const name = meta.longName || meta.shortName || null;
    const currency = meta.currency || null;
    const exchange = meta.exchangeName || null;

    return new Response(JSON.stringify({ name, currency, exchange }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
}