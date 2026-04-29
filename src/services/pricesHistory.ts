import { supabase } from "../app/supabase";
import type { Quote } from "./quotes";

/** Récupère l'historique Yahoo pour un symbole.
 *  fromDate/toDate optionnels pour une fenêtre précise (sinon 5 ans). */
async function fetchYahooHistory(
  symbol: string,
  fromDate?: string,
  toDate?: string
): Promise<{ date: string; close: number }[]> {
  let url: string;
  if (import.meta.env.DEV) {
    if (fromDate && toDate) {
      const p1 = Math.floor(new Date(fromDate).getTime() / 1000);
      const p2 = Math.floor(new Date(toDate).getTime() / 1000) + 86400;
      url = `/yahoo-proxy/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${p2}`;
    } else {
      url = `/yahoo-proxy/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y`;
    }
  } else {
    const params = new URLSearchParams({ symbol });
    if (fromDate && toDate) { params.set("from", fromDate); params.set("to", toDate); }
    url = `/api/history?${params}`;
  }

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  if (import.meta.env.DEV) {
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().split("T")[0], close: closes[i] }))
      .filter((p): p is { date: string; close: number } =>
        p.close !== null && p.close !== undefined && Number.isFinite(p.close)
      );
  } else {
    return data.prices ?? [];
  }
}

/**
 * Récupère et sauvegarde les cours pour une date précise (fenêtre de 35 jours avant).
 */
export async function fetchAndSavePricesForDate(
  symbols: string[],
  targetDate: string,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<{ saved: number; failed: string[]; pricesBySymbol: Record<string, number> }> {
  const from = new Date(targetDate);
  from.setDate(from.getDate() - 35);
  const fromStr = from.toISOString().split("T")[0];

  let saved = 0;
  const failed: string[] = [];
  const pricesBySymbol: Record<string, number> = {};

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    onProgress?.(i, symbols.length, symbol);
    try {
      const prices = await fetchYahooHistory(symbol, fromStr, targetDate);
      if (prices.length === 0) { failed.push(symbol); continue; }

      // Prix le plus récent <= targetDate (dernier élément, Yahoo retourne en ordre chronologique)
      const lastPrice = prices[prices.length - 1];
      if (lastPrice) pricesBySymbol[symbol] = lastPrice.close;

      const rows = prices.map(p => ({ symbol, close: p.close, date: p.date, provider: "yahoo" }));
      const { error } = await supabase
        .from("daily_prices")
        .upsert(rows, { onConflict: "symbol,date", ignoreDuplicates: false });
      if (error) console.warn(`Supabase upsert failed for ${symbol}:`, error.message);
      else saved += prices.length;
    } catch (e: any) {
      console.warn(`fetchForDate failed for ${symbol}:`, e?.message);
      failed.push(symbol);
    }
  }

  onProgress?.(symbols.length, symbols.length, "");
  return { saved, failed, pricesBySymbol };
}

/**
 * Backfill des cours historiques manquants pour une liste de symboles.
 * Récupère jusqu'à 5 ans de données journalières et les upsert dans daily_prices.
 */
export async function backfillHistoricalPrices(
  symbols: string[],
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<{ saved: number; failed: string[] }> {
  let saved = 0;
  const failed: string[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    onProgress?.(i, symbols.length, symbol);
    try {
      const prices = await fetchYahooHistory(symbol);
      if (prices.length === 0) { failed.push(symbol); continue; }

      const rows = prices.map(p => ({ symbol, close: p.close, date: p.date, provider: "yahoo" }));

      // Upsert par lots de 500
      for (let j = 0; j < rows.length; j += 500) {
        const batch = rows.slice(j, j + 500);
        const { error } = await supabase
          .from("daily_prices")
          .upsert(batch, { onConflict: "symbol,date", ignoreDuplicates: false });
        if (error) throw new Error(error.message);
      }
      saved += prices.length;
    } catch (e: any) {
      console.warn(`backfill failed for ${symbol}:`, e?.message);
      failed.push(symbol);
    }
  }

  onProgress?.(symbols.length, symbols.length, "");
  return { saved, failed };
}

/**
 * Sauvegarde les cours dans la table daily_prices.
 * Une seule entrée par symbole par jour (upsert sur symbol + date).
 */
export async function savePricesToHistory(quotes: Quote[]): Promise<void> {
  const today = new Date().toISOString().split("T")[0]; // "2026-03-07"

  const rows = quotes
    .filter((q) => q.price !== null)
    .map((q) => ({
      symbol: q.symbol,
      close: q.price,
      date: today,
      provider: "yahoo",
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("daily_prices")
    .upsert(rows, { onConflict: "symbol,date", ignoreDuplicates: false });

  if (error) {
    console.warn("Failed to save prices to history:", error.message);
  }
}

/**
 * Récupère le dernier cours connu pour chaque symbole à une date donnée
 * (remonte jusqu'à 30 jours en arrière pour gérer weekends / jours fériés).
 */
export async function getPricesForDate(
  symbols: string[],
  date: string
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  const from = new Date(date);
  from.setDate(from.getDate() - 30);
  const fromStr = from.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_prices")
    .select("symbol, close, date")
    .in("symbol", symbols.map((s) => s.toUpperCase()))
    .lte("date", date)
    .gte("date", fromStr)
    .order("date", { ascending: false });

  if (error) {
    console.warn("Failed to fetch historical prices:", error.message);
    return {};
  }

  const result: Record<string, number> = {};
  for (const row of data ?? []) {
    const sym = (row.symbol as string).toUpperCase();
    if (!(sym in result)) {
      result[sym] = Number(row.close);
    }
  }
  return result;
}

/**
 * Récupère l'historique des cours pour un symbole.
 */
export async function getPriceHistory(
  symbol: string,
  limit = 365
): Promise<{ date: string; close: number }[]> {
  const { data, error } = await supabase
    .from("daily_prices")
    .select("date, close")
    .eq("symbol", symbol.toUpperCase())
    .order("date", { ascending: true })
    .limit(limit);

  if (error) {
    console.warn("Failed to fetch price history:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    date: row.date,
    close: Number(row.close),
  }));
}