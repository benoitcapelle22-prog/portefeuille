import { useMemo, useEffect } from "react";
import { Dashboard } from "../components/Dashboard";
import { usePortfolio } from "../components/PortfolioLayout";
import { useQuotes } from "../hooks/useQuotes";

export function DashboardPage() {
  const { currentData, currentPortfolio, portfolios, currentPortfolioId, refreshData } = usePortfolio();

  // Refresh au montage de la page et à chaque changement de portefeuille
  useEffect(() => {
    refreshData();
  }, [currentPortfolioId]);

  // Calculer le total des liquidités (consolidé ou individuel)
  const totalCash = currentPortfolioId === "ALL"
    ? portfolios.reduce((sum, p) => sum + (p.cash || 0), 0)
    : (currentPortfolio?.cash || 0);

  // Récupérer les cours live — même logique que CurrentPositions
  const symbols = useMemo(
    () => Array.from(new Set(currentData.positions.map((p) => (p.code || "").trim().toUpperCase()).filter(Boolean))),
    [currentData.positions]
  );
  const { quotesBySymbol } = useQuotes(symbols, 120_000);

  // Enrichir les positions avec les cours live
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

      const totalValue = p.quantity * effectivePrice;
      const latentGainLoss = totalValue - p.totalCost;
      const latentGainLossPercent = p.totalCost > 0 ? (latentGainLoss / p.totalCost) * 100 : 0;
      return { ...p, currentPrice: effectivePrice, totalValue, latentGainLoss, latentGainLossPercent };
    });
  }, [currentData.positions, quotesBySymbol]);

  // totalPortfolio = valeur actuelle des positions (cours live) + liquidités
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