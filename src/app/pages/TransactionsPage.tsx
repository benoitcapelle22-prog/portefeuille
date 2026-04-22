import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
        <TabsTrigger value="positions" className="text-xs sm:text-sm py-2">Positions en cours</TabsTrigger>
        <TabsTrigger value="cloturees" className="text-xs sm:text-sm py-2">Pos. clôturées</TabsTrigger>
        <TabsTrigger value="dividendes" className="text-xs sm:text-sm py-2">Dividendes</TabsTrigger>
        <TabsTrigger value="historique" className="text-xs sm:text-sm py-2">Historique</TabsTrigger>
      </TabsList>

      <TabsContent value="positions">
        <CurrentPositions
          positions={currentData.positions}
          portfolioCurrency={displayCurrency}
          onAction={handlePositionAction}
          transactions={currentData.transactions}
          cash={totalCashConsolidated}
          onUpdateCash={handleUpdateCash}
          portfolioCategory={hasAnyTradingPortfolio ? "Trading" : currentPortfolio?.category}
          onUpdateStopLoss={handleUpdateStopLoss}
          onUpdateCurrentPrice={handleUpdateCurrentPrice}
          portfolioId={currentPortfolioId || undefined}
          quotesBySymbol={quotesBySymbol}
          onNewTransaction={() => { setDialogInitialData({}); setDialogOpen(true); }}
        />
      </TabsContent>

      <TabsContent value="cloturees">
        <ClosedPositions
          closedPositions={currentData.closedPositions}
          transactions={currentData.transactions}
          portfolioCurrency={displayCurrency}
        />
      </TabsContent>

      <TabsContent value="dividendes">
        <DividendsHistory
          transactions={currentData.transactions}
          portfolioCurrency={displayCurrency}
          onNewDividend={() => { setDialogInitialData({ type: "dividende" }); setDialogOpen(true); }}
        />
      </TabsContent>

      <TabsContent value="historique">
        <TransactionHistory
          transactions={currentData.transactions}
          onDeleteTransaction={handleDeleteTransaction}
          onEditTransaction={handleEditTransaction}
          portfolioCurrency={displayCurrency}
          portfolios={portfolios}
          currentPortfolio={currentPortfolio}
          currentPortfolioId={currentPortfolioId || undefined}
        />
      </TabsContent>
    </Tabs>
  );
}
