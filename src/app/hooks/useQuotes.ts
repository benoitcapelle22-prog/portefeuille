import { useEffect, useMemo, useRef, useState } from "react";
import { getQuotes, type Quote } from "../../services/quotes";
import { savePricesToHistory } from "../../services/pricesHistory";

type UseQuotesResult = {
  quotesBySymbol: Record<string, Quote>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updatedAt: number | null;
};

function uniqSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
}

/** Retourne le délai en ms avant la prochaine synchronisation (12h ou 18h) */
function msUntilNextRefresh(): number {
  const now = new Date();
  const scheduleHours = [12, 18];

  for (const hour of scheduleHours) {
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() > now.getTime()) {
      return next.getTime() - now.getTime();
    }
  }

  // Les deux créneaux sont passés → prochain à 12h demain
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  return tomorrow.getTime() - now.getTime();
}

export function useQuotes(symbols: string[]): UseQuotesResult {
  const normalized = useMemo(() => uniqSymbols(symbols), [symbols.join("|")]);
  const [quotesBySymbol, setQuotesBySymbol] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    if (normalized.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const quotes = await getQuotes(normalized);

      const map: Record<string, Quote> = {};
      for (const q of quotes) {
        map[q.symbol.toUpperCase()] = q;
      }

      setQuotesBySymbol((prev) => ({ ...prev, ...map }));
      setUpdatedAt(Date.now());

      // Sauvegarde en arrière-plan dans daily_prices
      savePricesToHistory(quotes).catch((e) =>
        console.warn("pricesHistory save failed:", e)
      );
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const ms = msUntilNextRefresh();
      timeoutId = setTimeout(() => {
        refresh();
        scheduleNext();
      }, ms);
    };

    scheduleNext();

    return () => {
      clearTimeout(timeoutId);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.join(",")]);

  return { quotesBySymbol, loading, error, refresh, updatedAt };
}
