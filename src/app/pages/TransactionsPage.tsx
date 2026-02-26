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
    handleDeleteTransaction,
    handlePositionAction,
    handleUpdateCash,
    handleUpdateStopLoss,
    handleUpdateCurrentPrice,
    portfolios,
    currentPortfolioId,
  } = usePortfolio();

  const handleImportTransactions = (transactions: any[]) => {
    transactions.forEach(transaction => {
      handleAddTransaction(transaction);
    });
  };

  // En vue consolidée, utiliser EUR comme devise par défaut et vérifier si au moins un portefeuille est de type Trading
  const isConsolidatedView = currentPortfolioId === "ALL";
  const displayCurrency = isConsolidatedView ? "EUR" : currentPortfolio?.currency;
  const hasAnyTradingPortfolio = isConsolidatedView 
    ? portfolios.some(p => p.category === "Trading")
    : currentPortfolio?.category === "Trading";
  const totalCashConsolidated = isConsolidatedView
    ? portfolios.reduce((sum, p) => sum + (p.cash || 0), 0)
    : (currentPortfolio?.cash || 0);

  return (
    <Tabs defaultValue="mouvements" className="w-full">
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
          portfolioCurrency={displayCurrency}
        />
      </TabsContent>
    </Tabs>
  );
}