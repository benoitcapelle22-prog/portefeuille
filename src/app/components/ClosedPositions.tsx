import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Search, X, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export interface ClosedPosition {
  code: string;
  name: string;
  purchaseDate: string;
  saleDate: string;
  quantity: number;
  pru: number;
  averageSalePrice: number;
  totalPurchase: number;
  totalSale: number;
  gainLoss: number;
  gainLossPercent: number;
  dividends?: number;
  portfolioCode?: string; // Code du portefeuille d'origine (en vue consolidée)
  sector?: string; // Secteur d'activité
}

interface ClosedPositionsProps {
  closedPositions: ClosedPosition[];
  transactions: Transaction[];
  portfolioCurrency?: string;
}

export function ClosedPositions({ closedPositions, transactions, portfolioCurrency = 'EUR' }: ClosedPositionsProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showSector, setShowSector] = useState(false); // Affichage colonne secteur

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: portfolioCurrency
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Filtrer les positions
  const filteredPositions = closedPositions.filter(position => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch = searchFilter === "" || 
      position.code.toLowerCase().includes(searchLower) ||
      position.name.toLowerCase().includes(searchLower);
    
    const saleDate = new Date(position.saleDate);
    const matchesStartDate = !startDate || saleDate >= new Date(startDate);
    const matchesEndDate = !endDate || saleDate <= new Date(endDate);
    
    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const totalGainLoss = filteredPositions.reduce((sum, pos) => sum + pos.gainLoss, 0);
  const totalInvested = filteredPositions.reduce((sum, pos) => sum + (pos.pru * pos.quantity), 0);
  const totalDividends = filteredPositions.reduce((sum, pos) => sum + (pos.dividends || 0), 0);
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "";

  const resetFilters = () => {
    setSearchFilter("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <Card>
      <CardHeader>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Barre de filtres */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher par code ou nom..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Date de début"
                className="w-40"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Date de fin"
                className="w-40"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSector(!showSector)}
              title={showSector ? "Masquer secteur" : "Afficher secteur"}
            >
              {showSector ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              Secteur
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
              >
                <X className="h-4 w-4 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  {closedPositions.some(p => p.portfolioCode) && (
                    <TableHead>Portefeuille</TableHead>
                  )}
                  <TableHead>Date de vente</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Nom</TableHead>
                  {showSector && <TableHead>Secteur</TableHead>}
                  <TableHead className="text-right">Nombre</TableHead>
                  <TableHead className="text-right">Montant investi</TableHead>
                  <TableHead className="text-right">Montant vente</TableHead>
                  <TableHead className="text-right">+/- Value ({portfolioCurrency})</TableHead>
                  <TableHead className="text-right">+/- Value %</TableHead>
                  <TableHead className="text-right">Dividendes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Aucune position clôturée
                    </TableCell>
                  </TableRow>
                )}
                {filteredPositions.map((position, index) => {
                  const hasPortfolioCodeColumn = closedPositions.some(p => p.portfolioCode);
                  return (
                    <TableRow key={`${position.portfolioCode || ''}-${position.code}-${index}`}>
                      {hasPortfolioCodeColumn && (
                        <TableCell className="font-medium">{position.portfolioCode || '-'}</TableCell>
                      )}
                      <TableCell>{formatDate(position.saleDate)}</TableCell>
                      <TableCell className="font-medium">{position.code}</TableCell>
                      <TableCell>{position.name}</TableCell>
                      {showSector && <TableCell>{position.sector}</TableCell>}
                      <TableCell className="text-right">{position.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.pru * position.quantity)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.averageSalePrice * position.quantity)}</TableCell>
                      <TableCell className={`text-right ${position.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(position.gainLoss)}
                      </TableCell>
                      <TableCell className={`text-right ${position.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(position.gainLossPercent)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(position.dividends || 0)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-bold bg-muted/50">
                  {closedPositions.some(p => p.portfolioCode) && <TableCell />}
                  <TableCell colSpan={showSector ? 5 : 4}>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalInvested)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalInvested + totalGainLoss)}</TableCell>
                  <TableCell className={`text-right ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalGainLoss)}
                  </TableCell>
                  <TableCell className={`text-right ${totalGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(totalGainLossPercent)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(totalDividends)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}