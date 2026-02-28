import { useEffect, useState } from "react";
import { getQuotes, type Quote } from "../../services/quotes";

export function AaplQuoteWidget() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [q] = await getQuotes(["AAPL"]);
      setQuote(q ?? null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="rounded-xl border p-4 grid gap-2 max-w-md">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Cours AAPL</div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1 rounded-md border"
        >
          {loading ? "…" : "Actualiser"}
        </button>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      <div className="text-2xl font-bold">
        {quote?.price ?? "—"}
      </div>

      <div className="text-xs text-muted-foreground">
        {quote?.timestamp ? `Date: ${quote.timestamp}` : ""}
      </div>
    </div>
  );
}