import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Trash2, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EditTransactionDialog, type TransactionRow } from "./EditTransactionDialog";

interface TransactionHistoryProps {
  transactions: Transaction[];
  onDeleteTransaction?: (id: string) => void;
  portfolioCurrency?: string;
}

type SortKey =
  | "date"
  | "code"
  | "name"
  | "type"
  | "quantity"
  | "unitPrice"
  | "currency"
  | "conversionRate"
  | "fees"
  | "tff"
  | "total";

type SortDir = "asc" | "desc" | null;

export function TransactionHistory({
  transactions,
  onDeleteTransaction,
  portfolioCurrency = "EUR",
}: TransactionHistoryProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ✅ local state pour refléter l’update sans dépendre du parent
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(transactions);

  // ✅ Dialog edit
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);

  useEffect(() => {
    setLocalTransactions(transactions);
  }, [transactions]);

  const formatCurrency = (value: number, currency?: string) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || portfolioCurrency || "EUR",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR");
  };

  const getTotal = (transaction: Transaction) => {
    if (transaction.type === "vente") {
      return transaction.quantity * transaction.unitPrice - transaction.fees;
    }
    return transaction.quantity * transaction.unitPrice + transaction.fees + transaction.tff;
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Cycle: asc → desc → (retour tri date desc)
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey("date");
        setSortDir("desc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-30" />;
    if (sortDir === "asc") return <ChevronUp className="inline h-3 w-3 ml-1 text-primary" />;
    return <ChevronDown className="inline h-3 w-3 ml-1 text-primary" />;
  };

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  const hasPortfolioCodeColumn = useMemo(
    () => localTransactions.some(t => t.portfolioCode),
    [localTransactions]
  );

  // Filtrer
  const filteredTransactions = localTransactions.filter(transaction => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch =
      searchFilter === "" ||
      transaction.code.toLowerCase().includes(searchLower) ||
      transaction.name.toLowerCase().includes(searchLower);

    const transDate = new Date(transaction.date);
    const matchesStartDate = !startDate || transDate >= new Date(startDate);
    const matchesEndDate = !endDate || transDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  // Trier
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let valA: any;
    let valB: any;

    switch (sortKey) {
      case "date":
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
        break;
      case "code":
        valA = a.code;
        valB = b.code;
        break;
      case "name":
        valA = a.name;
        valB = b.name;
        break;
      case "type":
        valA = a.type;
        valB = b.type;
        break;
      case "quantity":
        valA = a.quantity;
        valB = b.quantity;
        break;
      case "unitPrice":
        valA = a.unitPrice;
        valB = b.unitPrice;
        break;
      case "currency":
        valA = a.currency;
        valB = b.currency;
        break;
      case "conversionRate":
        valA = a.conversionRate;
        valB = b.conversionRate;
        break;
      case "fees":
        valA = a.fees;
        valB = b.fees;
        break;
      case "tff":
        valA = a.tff;
        valB = b.tff;
        break;
      case "total":
        valA = getTotal(a);
        valB = getTotal(b);
        break;
      default:
        valA = 0;
        valB = 0;
    }

    if (typeof valA === "string") {
      return sortDir === "asc" ? valA.localeCompare(valB, "fr") : valB.localeCompare(valA, "fr");
    }
    return sortDir === "asc" ? valA - valB : valB - valA;
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

  const openEdit = (tx: Transaction) => {
    // Adapt Transaction -> TransactionRow attendu par EditTransactionDialog
    const row: TransactionRow = {
      id: tx.id,
      date: tx.date,
      code: tx.code,
      name: tx.name,
      type: tx.type,
      quantity: tx.quantity,
      unitPrice: tx.unitPrice,
      fees: tx.fees,
      tff: tx.tff,
      currency: tx.currency,
      conversionRate: tx.conversionRate,
      tax: (tx as any).tax ?? null,
      sector: (tx as any).sector ?? null,
    };
    setEditing(row);
    setEditOpen(true);
  };

  return (
    <Card>
      <CardContent>
        {localTransactions.length === 0 ? (
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
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                <span className="text-muted-foreground">-</span>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Réinitialiser
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}

                    <TableHead className={thClass} onClick={() => handleSort("date")}>
                      Date <SortIcon col="date" />
                    </TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("code")}>
                      Code <SortIcon col="code" />
                    </TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("name")}>
                      Nom <SortIcon col="name" />
                    </TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("type")}>
                      Type <SortIcon col="type" />
                    </TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("quantity")}>
                      Quantité <SortIcon col="quantity" />
                    </TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("unitPrice")}>
                      Prix unitaire <SortIcon col="unitPrice" />
                    </TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("currency")}>
                      Devise <SortIcon col="currency" />
                    </TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("conversionRate")}>
                      Taux conversion <SortIcon col="conversionRate" />
                    </TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("fees")}>
                      Frais <SortIcon col="fees" />
                    </TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("tff")}>
                      TFF <SortIcon col="tff" />
                    </TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("total")}>
                      Total <SortIcon col="total" />
                    </TableHead>

                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {sortedTransactions.map((transaction) => {
                    const total = getTotal(transaction);

                    return (
                      <TableRow key={transaction.id}>
                        {hasPortfolioCodeColumn && (
                          <TableCell className="font-medium">{transaction.portfolioCode || "-"}</TableCell>
                        )}

                        <TableCell>{formatDate(transaction.date)}</TableCell>
                        <TableCell className="font-medium">{transaction.code}</TableCell>
                        <TableCell>{transaction.name}</TableCell>
                        <TableCell>{getTypeBadge(transaction.type)}</TableCell>
                        <TableCell className="text-right">{transaction.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.unitPrice)}</TableCell>
                        <TableCell>{transaction.currency}</TableCell>
                        <TableCell className="text-right">{transaction.conversionRate}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.fees)}</TableCell>
                        <TableCell className="text-right">
                          {transaction.type === "vente" ? "-" : formatCurrency(transaction.tff)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(total)}</TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(transaction)}>
                              <Pencil className="size-4" />
                            </Button>

                            {onDeleteTransaction && (
                              <Button variant="ghost" size="sm" onClick={() => onDeleteTransaction(transaction.id)}>
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ✅ Dialog d’édition */}
            <EditTransactionDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              transaction={editing}
              onSaved={(updated) => {
                // update local
                setLocalTransactions(prev => prev.map(t => (t.id === updated.id ? (updated as any) : t)));
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}