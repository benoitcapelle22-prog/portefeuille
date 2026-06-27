import { useEffect, useState } from "react";
import { Briefcase, Archive, Coins, History } from "lucide-react";
import { CurrentPositions } from "../components/CurrentPositions";
import { ClosedPositions } from "../components/ClosedPositions";
import { TransactionHistory } from "../components/TransactionHistory";
import { DividendsHistory } from "../components/DividendsHistory";
import { usePortfolio } from "../components/PortfolioLayout";
import { useExchangeRates } from "../hooks/useExchangeRates";

export function TransactionsPage() {
  const {
    currentData,
    currentPortfolio,
    handleDeleteTransaction,
    handleEditTransaction,
    handlePositionAction,
    handleUpdateCash,
    handleUpdateStopLoss,
    handleUpdateSector,
    handleUpdateCurrentPrice,
    portfolios,
    currentPortfolioId,
    refreshData,
    setDialogOpen,
    setDialogInitialData,
    quotesBySymbol,
  } = usePortfolio();

  // Onglet contrôlé : reset à "positions" à chaque changement de portefeuille
  const [activeTab, setActiveTab] = useState("positions");
  useEffect(() => {
    setActiveTab("positions");
  }, [currentPortfolioId]);

  // Refresh des données à chaque montage de la page et changement de portefeuille
  useEffect(() => {
    refreshData();
  }, [currentPortfolioId]);

  const { getConversionRate } = useExchangeRates();

  const isConsolidatedView = currentPortfolioId === "ALL";
  const displayCurrency = isConsolidatedView ? "EUR" : currentPortfolio?.currency;
  const hasAnyTradingPortfolio = isConsolidatedView
    ? portfolios.some(p => p.category === "Trading")
    : currentPortfolio?.category === "Trading";
  // Vue consolidée : cash de chaque portefeuille converti en EUR
  const totalCashConsolidated = isConsolidatedView
    ? portfolios.reduce((sum, p) => {
        const rate = getConversionRate(p.currency); // 1 EUR = ? devise
        return sum + (p.cash || 0) / rate;
      }, 0)
    : (currentPortfolio?.cash || 0);

  const tabs = [
    { key: "positions",  label: "Positions en cours", icon: Briefcase, iconClass: "text-blue-500" },
    { key: "cloturees",  label: "Pos. clôturées",     icon: Archive,   iconClass: "text-amber-500" },
    { key: "dividendes", label: "Dividendes",          icon: Coins,     iconClass: "text-green-500" },
    { key: "historique", label: "Historique",          icon: History,   iconClass: "text-violet-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className={`h-4 w-4 ${t.iconClass}`} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "positions" && (
        <CurrentPositions
          positions={currentData.positions}
          portfolioCurrency={displayCurrency}
          onAction={handlePositionAction}
          transactions={currentData.transactions}
          cash={totalCashConsolidated}
          onUpdateCash={handleUpdateCash}
          portfolioCategory={hasAnyTradingPortfolio ? "Trading" : currentPortfolio?.category}
          onUpdateStopLoss={handleUpdateStopLoss}
          onUpdateSector={handleUpdateSector}
          onUpdateCurrentPrice={handleUpdateCurrentPrice}
          portfolioId={currentPortfolioId || undefined}
          quotesBySymbol={quotesBySymbol}
          onNewTransaction={() => { setDialogInitialData({}); setDialogOpen(true); }}
        />
      )}

      {activeTab === "cloturees" && (
        <ClosedPositions
          closedPositions={currentData.closedPositions}
          transactions={currentData.transactions}
          portfolioCurrency={displayCurrency}
        />
      )}

      {activeTab === "dividendes" && (
        <DividendsHistory
          transactions={currentData.transactions}
          portfolioCurrency={displayCurrency}
          onNewDividend={() => { setDialogInitialData({ type: "dividende" }); setDialogOpen(true); }}
          onDeleteDividend={handleDeleteTransaction}
        />
      )}

      {activeTab === "historique" && (
        <TransactionHistory
          transactions={currentData.transactions}
          onDeleteTransaction={handleDeleteTransaction}
          onEditTransaction={handleEditTransaction}
          portfolioCurrency={displayCurrency}
          portfolios={portfolios}
          currentPortfolio={currentPortfolio}
          currentPortfolioId={currentPortfolioId || undefined}
        />
      )}
    </div>
  );
}
