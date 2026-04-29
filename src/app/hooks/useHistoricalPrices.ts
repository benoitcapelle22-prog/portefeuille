import { useEffect, useMemo, useState } from "react";
import { getPricesForDate } from "../../services/pricesHistory";

type UseHistoricalPricesResult = {
  prices: Record<string, number>;
  loading: boolean;
};

export function useHistoricalPrices(
  symbols: string[],
  date: string | null,
  refreshKey?: number
): UseHistoricalPricesResult {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const symbolsKey = useMemo(() => symbols.join("|"), [symbols]);

  useEffect(() => {
    if (!date || symbols.length === 0) {
      setPrices({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    getPricesForDate(symbols, date)
      .then((p) => {
        if (!cancelled) {
          setPrices(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbolsKey, date, refreshKey]);

  return { prices, loading };
}
