import { supabase } from "../app/supabase";
import type { Quote } from "./quotes";

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