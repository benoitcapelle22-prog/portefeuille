import { Dashboard } from "../components/Dashboard";
import { usePortfolio } from "../components/PortfolioLayout";

export function DashboardPage() {
  const { currentData, currentPortfolio, portfolios, currentPortfolioId } = usePortfolio();

  // Calculer le total des liquidités (consolidé ou individuel)
  const totalCash = currentPortfolioId === "ALL"
    ? portfolios.reduce((sum, p) => sum + (p.cash || 0), 0)
    : (currentPortfolio?.cash || 0);

  return (
    <div className="space-y-6">
      <Dashboard
        positions={currentData.positions}
        transactions={currentData.transactions}
        closedPositions={currentData.closedPositions}
        portfolioCurrency={currentPortfolio?.currency}
        cash={totalCash}
      />
    </div>
  );
}