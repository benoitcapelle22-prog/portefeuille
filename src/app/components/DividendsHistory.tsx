import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface DividendsHistoryProps {
  transactions: Transaction[];
  portfolioCurrency?: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";
}

export function DividendsHistory({ transactions, portfolioCurrency = "EUR" }: DividendsHistoryProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const formatCurrency = (value: number, currency: string = portfolioCurrency) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  // Filtrer uniquement les dividendes
  const dividends = transactions
    .filter(t => t.type === "dividende")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Filtrer les dividendes
  const filteredDividends = dividends.filter(dividend => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch = searchFilter === "" || 
      dividend.code.toLowerCase().includes(searchLower) ||
      dividend.name.toLowerCase().includes(searchLower);
    
    const divDate = new Date(dividend.date);
    const matchesStartDate = !startDate || divDate >= new Date(startDate);
    const matchesEndDate = !endDate || divDate <= new Date(endDate);
    
    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  // Calculer le total des dividendes (bruts et nets) sur les résultats filtrés
  const totalDividends = filteredDividends.reduce((sum, d) => {
    const convertedAmount = (d.unitPrice * d.quantity) * d.conversionRate;
    return sum + convertedAmount;
  }, 0);

  const totalTax = filteredDividends.reduce((sum, d) => {
    const convertedTax = (d.tax || 0) * d.conversionRate;
    return sum + convertedTax;
  }, 0);

  const totalNetDividends = totalDividends - totalTax;

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "";

  const resetFilters = () => {
    setSearchFilter("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <Card>
      
      <CardContent>
        {dividends.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucun dividende enregistré</p>
        ) : (
          <>
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
                  <TableHeader>
                    <TableRow>
                      {transactions.some(t => t.portfolioCode) && (
                        <TableHead>Portefeuille</TableHead>
                      )}
                      <TableHead>Date</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead className="text-right">Dividende par action</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                      <TableHead>Devise</TableHead>
                      <TableHead className="text-right">Taux conversion</TableHead>
                      <TableHead className="text-right">Montant brut</TableHead>
                      <TableHead className="text-right">Impôt</TableHead>
                      <TableHead className="text-right">Montant net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDividends.map((dividend) => {
                      const totalAmount = (dividend.unitPrice * dividend.quantity) * dividend.conversionRate;
                      const taxAmount = (dividend.tax || 0) * dividend.conversionRate;
                      const netAmount = totalAmount - taxAmount;
                      const hasPortfolioCodeColumn = transactions.some(t => t.portfolioCode);
                      return (
                        <TableRow key={dividend.id}>
                          {hasPortfolioCodeColumn && (
                            <TableCell className="font-medium">{dividend.portfolioCode || '-'}</TableCell>
                          )}
                          <TableCell>{formatDate(dividend.date)}</TableCell>
                          <TableCell className="font-medium">{dividend.code}</TableCell>
                          <TableCell>{dividend.name}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(dividend.unitPrice, dividend.currency)}
                          </TableCell>
                          <TableCell className="text-right">{dividend.quantity}</TableCell>
                          <TableCell>{dividend.currency}</TableCell>
                          <TableCell className="text-right">{dividend.conversionRate}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(totalAmount)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(taxAmount)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(netAmount)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total des dividendes</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalDividends)}
                </p>
                <p className="text-sm text-muted-foreground">Impôts</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalTax)}
                </p>
                <p className="text-sm text-muted-foreground">Total net</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalNetDividends)}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}