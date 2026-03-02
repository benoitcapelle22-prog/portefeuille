import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export default async function handler(req, res) {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: "No symbols provided" });
    }

    const symbolsArray = String(symbols)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const results = await Promise.all(
      symbolsArray.map(async (symbol) => {
        const quote = await yahooFinance.quote(symbol);

        return {
          symbol: quote.symbol,
          name:
            quote.longName ||
            quote.shortName ||
            quote.displayName ||
            quote.quoteSourceName ||
            null,
          price: quote.regularMarketPrice ?? null,
          currency: quote.currency ?? null,
          timestamp: quote.regularMarketTime ?? null,
          source: "yahoo",
        };
      })
    );

    return res.status(200).json({ quotes: results });
  } catch (error) {
    console.error("Yahoo API error:", error);
    return res.status(500).json({ error: "Failed to fetch quotes" });
  }
}