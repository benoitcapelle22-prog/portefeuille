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