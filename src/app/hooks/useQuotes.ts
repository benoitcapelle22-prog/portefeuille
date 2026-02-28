import { useEffect, useMemo, useRef, useState } from "react";
import { getQuotes, type Quote } from "../../services/quotes";

type UseQuotesResult = {
  quotesBySymbol: Record<string, Quote>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updatedAt: number | null;
};

function uniqSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean)));
}

export function useQuotes(symbols: string[], refreshMs = 60_000): UseQuotesResult {
  const normalized = useMemo(() => uniqSymbols(symbols), [symbols.join("|")]);
  const [quotesBySymbol, setQuotesBySymbol] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    if (normalized.length === 0) return;

    // évite requêtes concurrentes
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // getQuotes utilise fetch; ici on ne passe pas signal (optionnel).
      // Si tu veux le signal, je te le modifie.
      const quotes = await getQuotes(normalized);

      const map: Record<string, Quote> = {};
      for (const q of quotes) {
        map[q.symbol.toUpperCase()] = q;
      }

      setQuotesBySymbol(prev => ({ ...prev, ...map }));
      setUpdatedAt(Date.now());
    } catch (e: any) {
      // Si ça échoue (quota, réseau…), on garde les derniers cours affichés
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1er chargement
    refresh();

    // auto-refresh
    const id = window.setInterval(() => {
      refresh();
    }, refreshMs);

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.join(","), refreshMs]);

  return { quotesBySymbol, loading, error, refresh, updatedAt };
}