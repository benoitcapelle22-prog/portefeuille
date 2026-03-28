import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { CurrentPositions } from "../components/CurrentPositions";
import { ClosedPositions } from "../components/ClosedPositions";
import { TransactionHistory } from "../components/TransactionHistory";
import { DividendsHistory } from "../components/DividendsHistory";
import { usePortfolio } from "../components/PortfolioLayout";
import { Button } from "../components/ui/button";
import { Plus } from "lucide-react";

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
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="positions">Positions en cours</TabsTrigger>
        <TabsTrigger value="cloturees">Positions clôturées</TabsTrigger>
        <TabsTrigger value="dividendes">Dividendes</TabsTrigger>
        <TabsTrigger value="historique">Historique</TabsTrigger>
      </TabsList>

      <TabsContent value="positions">
        <div className="flex justify-end gap-2 mb-4">
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouveau mouvement
          </Button>
        </div>
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
