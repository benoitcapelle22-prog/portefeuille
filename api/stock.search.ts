import type { VercelRequest, VercelResponse } from "@vercel/node";

type SearchResult = {
  symbol: string;
  name: string | null;
  sector: string | null;
};

const cache = new Map<string, { result: SearchResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toUpperCase() : "";

  if (!q || q.length < 1) {
    res.status(400).json({ error: "Provide ?q=SYMBOL" });
    return;
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing FMP_API_KEY env var" });
    return;
  }

  // Cache
  const now = Date.now();
  const cached = cache.get(q);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(cached.result);
    return;
  }

  try {
    // Nouvel endpoint FMP stable
    const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(q)}&apikey=${apiKey}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      console.error(`FMP profile HTTP ${response.status} for ${q}`);
      res.status(200).json({ symbol: q, name: null, sector: null });
      return;
    }

    const data = await response.json();
    const profile = Array.isArray(data) ? data[0] : null;

    const name = profile?.companyName ?? null;
    const sector = profile?.sector ?? null;

    const result: SearchResult = { symbol: q, name, sector };
    if (name) cache.set(q, { result, expiresAt: now + CACHE_TTL_MS });

    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(result);
  } catch (e: any) {
    console.error(`stock-search error for ${q}:`, e?.message);
    res.status(200).json({ symbol: q, name: null, sector: null });
  }
}