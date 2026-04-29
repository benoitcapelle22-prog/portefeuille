type VercelRequest = { query: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> };
type VercelResponse = { status(c: number): VercelResponse; json(b: unknown): void; setHeader(k: string, v: string): void };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase error (${res.status}): ${text}`);
  }
  return res;
}

async function getDistinctSymbols(): Promise<string[]> {
  const res = await supabaseFetch("/transactions?select=code&type=eq.achat");
  const rows: { code: string }[] = await res.json();
  return Array.from(new Set(rows.map((r) => r.code.trim().toUpperCase()).filter(Boolean)));
}

async function fetchYahooPrice(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { price: meta.regularMarketPrice, currency: meta.currency ?? "EUR" };
  } catch {
    return null;
  }
}

async function savePrices(rows: { symbol: string; close: number; date: string; provider: string }[]) {
  await supabaseFetch("/daily_prices", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Sécurité : vérifie le secret si défini
  if (CRON_SECRET && req.headers["authorization"] !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const symbols = await getDistinctSymbols();

    if (symbols.length === 0) {
      return res.status(200).json({ message: "No symbols found", saved: 0 });
    }

    // Fetch tous les cours en parallèle
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const quote = await fetchYahooPrice(symbol);
        return { symbol, quote };
      })
    );

    const rows = results
      .filter((r) => r.status === "fulfilled" && r.value.quote !== null)
      .map((r) => {
        const { symbol, quote } = (r as PromiseFulfilledResult<any>).value;
        return { symbol, close: quote.price, date: today, provider: "yahoo" };
      });

    if (rows.length > 0) await savePrices(rows);

    return res.status(200).json({
      message: "Prices saved",
      date: today,
      total: symbols.length,
      saved: rows.length,
      failed: symbols.length - rows.length,
    });
  } catch (e: any) {
    console.error("cron-prices error:", e);
    return res.status(500).json({ error: e.message });
  }
}