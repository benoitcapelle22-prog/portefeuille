import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { TransactionForm } from "../components/TransactionForm";
import { CurrentPositions } from "../components/CurrentPositions";
import { ClosedPositions } from "../components/ClosedPositions";
import { TransactionHistory } from "../components/TransactionHistory";
import { DividendsHistory } from "../components/DividendsHistory";
import { ImportTransactions } from "../components/ImportTransactions";
import { usePortfolio } from "../components/PortfolioLayout";

export function TransactionsPage() {
  const {
    currentData,
    currentPortfolio,
    handleAddTransaction,
    handleImportTransactions,
    handleDeleteTransaction,
    handleEditTransaction,
    handlePositionAction,
    handleUpdateCash,
    handleUpdateStopLoss,
    handleUpdateCurrentPrice,
    portfolios,
    currentPortfolioId,
    refreshData,
  } = usePortfolio();

  // Onglet contrôlé : reset à "mouvements" à chaque changement de portefeuille
  const [activeTab, setActiveTab] = useState("mouvements");
  useEffect(() => {
    setActiveTab("mouvements");
  }, [currentPortfolioId]);

  // Refresh des données à chaque montage de la page et changement de portefeuille
  useEffect(() => {
    refreshData();
  }, [currentPortfolioId]);

  const isConsolidatedView = currentPortfolioId === "ALL";
  const displayCurrency = isConsolidatedView ? "EUR" : currentPortfolio?.currency;
  const hasAnyTradingPortfolio = isConsolidatedView
    ? portfolios.some(p => p.category === "Trading")
    : currentPortfolio?.category === "Trading";
  const totalCashConsolidated = isConsolidatedView
    ? portfolios.reduce((sum, p) => sum + (p.cash || 0), 0)
    : (currentPortfolio?.cash || 0);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="mouvements">Mouvements</TabsTrigger>
        <TabsTrigger value="positions">Positions en cours</TabsTrigger>
        <TabsTrigger value="cloturees">Positions clôturées</TabsTrigger>
        <TabsTrigger value="dividendes">Dividendes</TabsTrigger>
        <TabsTrigger value="historique">Historique</TabsTrigger>
      </TabsList>

      <TabsContent value="mouvements" className="space-y-4">
        <div className="flex justify-end mb-4">
          <ImportTransactions onImportTransactions={handleImportTransactions} />
        </div>
        <TransactionForm
          onAddTransaction={handleAddTransaction}
          currentPortfolio={currentPortfolio}
          portfolios={portfolios}
        />
      </TabsContent>

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
        />
      </TabsContent>

      <TabsContent value="historique">
        <TransactionHistory
          transactions={currentData.transactions}
          onDeleteTransaction={handleDeleteTransaction}
          onEditTransaction={handleEditTransaction}
          portfolioCurrency={displayCurrency}
        />
      </TabsContent>
    </Tabs>
  );
}