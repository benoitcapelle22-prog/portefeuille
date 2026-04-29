import { useMemo, useEffect } from "react";
import { Dashboard } from "../components/Dashboard";
import { usePortfolio } from "../components/PortfolioLayout";
import { useQuotes } from "../hooks/useQuotes";
import { useExchangeRates } from "../hooks/useExchangeRates";

export function DashboardPage() {
  const { currentData, currentPortfolio, portfolios, currentPortfolioId, refreshData } = usePortfolio();

  useEffect(() => {
    refreshData();
  }, [currentPortfolioId]);

  const { getConversionRate } = useExchangeRates();
  const portfolioCurrency = currentPortfolio?.currency || "EUR";

  // Liquidités : vue consolidée → conversion dans la devise du portefeuille affiché (EUR)
  const totalCash = currentPortfolioId === "ALL"
    ? portfolios.reduce((sum, p) => {
        const rate = getConversionRate(p.currency || "EUR");
        return sum + (p.cash || 0) / rate;
      }, 0)
    : (currentPortfolio?.cash || 0);

  const symbols = useMemo(
    () => Array.from(new Set(currentData.positions.map((p) => (p.code || "").trim().toUpperCase()).filter(Boolean))),
    [currentData.positions]
  );
  const { quotesBySymbol } = useQuotes(symbols);

  // Positions enrichies avec cours live, valeurs converties en devise portefeuille
  const positionsWithPrices = useMemo(() => {
    return currentData.positions.map((p) => {
      const sym = (p.code || "").trim().toUpperCase();
      const livePrice = quotesBySymbol[sym]?.price ?? undefined;
      const effectivePrice =
        p.manualCurrentPrice !== undefined
          ? p.manualCurrentPrice
          : livePrice !== undefined
            ? livePrice
            : p.currentPrice;

      if (effectivePrice === undefined || !Number.isFinite(effectivePrice)) return { ...p };

      const posCurrency = p.currency || portfolioCurrency;
      const isForeign = posCurrency !== portfolioCurrency;
      const convRate = isForeign ? getConversionRate(posCurrency) : 1;

      const totalValueRaw = p.quantity * effectivePrice;
      const totalValue = convRate > 0 ? totalValueRaw / convRate : totalValueRaw;
      const latentGainLoss = totalValue - p.totalCost;
      const latentGainLossPercent = p.totalCost > 0 ? (latentGainLoss / p.totalCost) * 100 : 0;
      return { ...p, currentPrice: effectivePrice, totalValue, latentGainLoss, latentGainLossPercent };
    });
  }, [currentData.positions, quotesBySymbol, getConversionRate, portfolioCurrency]);

  const totalPortfolio = useMemo(() => {
    const totalValue = positionsWithPrices.reduce((sum, p) => sum + (p.totalValue || 0), 0);
    return totalValue + totalCash;
  }, [positionsWithPrices, totalCash]);

  return (
    <div className="space-y-6">
      <Dashboard
        positions={positionsWithPrices}
        transactions={currentData.transactions}
        closedPositions={currentData.closedPositions}
        portfolioCurrency={currentPortfolio?.currency}
        cash={totalCash}
        totalPortfolio={totalPortfolio}
      />
    </div>
  );
}
