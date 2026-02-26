import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Trash2, Search, X } from "lucide-react";
import { useState } from "react";

interface TransactionHistoryProps {
  transactions: Transaction[];
  onDeleteTransaction?: (id: string) => void;
  portfolioCurrency?: string;
}

export function TransactionHistory({ transactions, onDeleteTransaction, portfolioCurrency = 'EUR' }: TransactionHistoryProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const formatCurrency = (value: number, currency?: string) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || portfolioCurrency || 'EUR'
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Filtrer les transactions
  const filteredTransactions = sortedTransactions.filter(transaction => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch = searchFilter === "" || 
      transaction.code.toLowerCase().includes(searchLower) ||
      transaction.name.toLowerCase().includes(searchLower);
    
    const transDate = new Date(transaction.date);
    const matchesStartDate = !startDate || transDate >= new Date(startDate);
    const matchesEndDate = !endDate || transDate <= new Date(endDate);
    
    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "";

  const resetFilters = () => {
    setSearchFilter("");
    setStartDate("");
    setEndDate("");
  };

  const getTypeBadge = (type: Transaction["type"]) => {
    switch (type) {
      case "achat":
        return <Badge variant="default">Achat</Badge>;
      case "vente":
        return <Badge variant="destructive">Vente</Badge>;
      case "dividende":
        return <Badge className="bg-green-600">Dividende</Badge>;
      case "depot":
        return <Badge className="bg-blue-600">Dépôt</Badge>;
      case "retrait":
        return <Badge className="bg-orange-600">Retrait</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  return (
    <Card>
      
      <CardContent>
        {sortedTransactions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucun mouvement enregistré</p>
        ) : (
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
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Prix unitaire</TableHead>
                    <TableHead>Devise</TableHead>
                    <TableHead className="text-right">Taux conversion</TableHead>
                    <TableHead className="text-right">Frais</TableHead>
                    <TableHead className="text-right">TFF</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {onDeleteTransaction && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => {
                    // Calcul du total selon le type de transaction
                    let total: number;
                    if (transaction.type === "vente") {
                      // Pour une vente : montant reçu moins les frais (pas de TFF sur les ventes)
                      total = transaction.quantity * transaction.unitPrice - transaction.fees;
                    } else {
                      // Pour un achat : montant payé plus les frais et TFF
                      total = transaction.quantity * transaction.unitPrice + transaction.fees + transaction.tff;
                    }
                    
                    const hasPortfolioCodeColumn = transactions.some(t => t.portfolioCode);
                    return (
                      <TableRow key={transaction.id}>
                        {hasPortfolioCodeColumn && (
                          <TableCell className="font-medium">{transaction.portfolioCode || '-'}</TableCell>
                        )}
                        <TableCell>{formatDate(transaction.date)}</TableCell>
                        <TableCell className="font-medium">{transaction.code}</TableCell>
                        <TableCell>{transaction.name}</TableCell>
                        <TableCell>
                          {getTypeBadge(transaction.type)}
                        </TableCell>
                        <TableCell className="text-right">{transaction.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.unitPrice)}</TableCell>
                        <TableCell>{transaction.currency}</TableCell>
                        <TableCell className="text-right">{transaction.conversionRate}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.fees)}</TableCell>
                        <TableCell className="text-right">
                          {transaction.type === "vente" ? "-" : formatCurrency(transaction.tff)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                        {onDeleteTransaction && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDeleteTransaction(transaction.id)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}