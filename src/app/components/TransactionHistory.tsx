import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Trash2, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Pencil, ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { EditTransactionDialog, type TransactionRow } from "./EditTransactionDialog";
import { TransactionDialog } from "./TransactionDialog";
import { DividendDialog } from "./DividendDialog";
import { Portfolio } from "./PortfolioSelector";
import * as XLSX from "xlsx";

interface TransactionHistoryProps {
  transactions: Transaction[];
  onDeleteTransaction?: (id: string) => void;
  onEditTransaction?: (updated: Transaction) => Promise<void>;
  portfolioCurrency?: string;
  portfolios?: Portfolio[];
  currentPortfolio?: Portfolio;
  currentPortfolioId?: string;
}

type SortKey =
  | "date" | "code" | "name" | "type" | "quantity"
  | "unitPrice" | "currency" | "conversionRate" | "fees" | "tff" | "total";

type SortDir = "asc" | "desc" | null;

type TransactionType = Transaction["type"];

const ALL_TYPES: TransactionType[] = ["achat", "vente", "dividende", "depot", "retrait", "frais", "interets"];

const TYPE_LABELS: Record<TransactionType, string> = {
  achat:     "Achat",
  vente:     "Vente",
  dividende: "Dividende",
  depot:     "Dépôt",
  retrait:   "Retrait",
  frais:     "Frais",
  interets:  "Intérêts",
};

const TYPE_STYLES: Record<TransactionType, string> = {
  achat:     "bg-primary text-primary-foreground hover:bg-primary/90",
  vente:     "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  dividende: "bg-green-600 text-white hover:bg-green-700",
  depot:     "bg-blue-600 text-white hover:bg-blue-700",
  retrait:   "bg-orange-600 text-white hover:bg-orange-700",
  frais:     "bg-red-700 text-white hover:bg-red-800",
  interets:  "bg-teal-600 text-white hover:bg-teal-700",
};

const PAGE_SIZE = 10;

export function TransactionHistory({
  transactions,
  onDeleteTransaction,
  onEditTransaction,
  portfolioCurrency = "EUR",
  portfolios,
  currentPortfolio,
  currentPortfolioId,
}: TransactionHistoryProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<Set<TransactionType>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Dialog achat/vente (TransactionDialog)
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txDialogData, setTxDialogData] = useState<any>(null);
  // Dialog dividende (DividendDialog)
  const [dividendOpen, setDividendOpen] = useState(false);
  const [dividendDialogData, setDividendDialogData] = useState<any>(null);
  // Dialog dépôt/retrait (EditTransactionDialog)
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchFilter, startDate, endDate, yearFilter, typeFilter, sortKey, sortDir]);

  const formatCurrency = (value: number, currency?: string) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || portfolioCurrency || "EUR",
    }).format(value);
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("fr-FR");

  const getTotal = (transaction: Transaction) => {
    if (transaction.type === "vente") return transaction.quantity * transaction.unitPrice - transaction.fees;
    return transaction.quantity * transaction.unitPrice + transaction.fees + transaction.tff;
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey("date"); setSortDir("desc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleType = (type: TransactionType) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-30" />;
    if (sortDir === "asc") return <ChevronUp className="inline h-3 w-3 ml-1 text-primary" />;
    return <ChevronDown className="inline h-3 w-3 ml-1 text-primary" />;
  };

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  const hasPortfolioCodeColumn = useMemo(
    () => transactions.some(t => t.portfolioCode),
    [transactions]
  );

  const presentTypes = useMemo(
    () => new Set(transactions.map(t => t.type as TransactionType)),
    [transactions]
  );

  const years = useMemo(() => {
    const set = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const filteredTransactions = transactions.filter(transaction => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch = searchFilter === "" ||
      transaction.code.toLowerCase().includes(searchLower) ||
      transaction.name.toLowerCase().includes(searchLower);
    const transDate = new Date(transaction.date);
    const matchesStartDate = !startDate || transDate >= new Date(startDate);
    const matchesEndDate = !endDate || transDate <= new Date(endDate);
    const matchesYear = yearFilter === "all" || transDate.getFullYear() === Number(yearFilter);
    const matchesType = typeFilter.size === 0 || typeFilter.has(transaction.type as TransactionType);
    return matchesSearch && matchesStartDate && matchesEndDate && matchesYear && matchesType;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let valA: any, valB: any;
    switch (sortKey) {
      case "date": valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); break;
      case "code": valA = a.code; valB = b.code; break;
      case "name": valA = a.name; valB = b.name; break;
      case "type": valA = a.type; valB = b.type; break;
      case "quantity": valA = a.quantity; valB = b.quantity; break;
      case "unitPrice": valA = a.unitPrice; valB = b.unitPrice; break;
      case "currency": valA = a.currency; valB = b.currency; break;
      case "conversionRate": valA = a.conversionRate; valB = b.conversionRate; break;
      case "fees": valA = a.fees; valB = b.fees; break;
      case "tff": valA = a.tff; valB = b.tff; break;
      case "total": valA = getTotal(a); valB = getTotal(b); break;
      default: valA = 0; valB = 0;
    }
    if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB, "fr") : valB.localeCompare(valA, "fr");
    return sortDir === "asc" ? valA - valB : valB - valA;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTransactions = sortedTransactions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "" || yearFilter !== "all" || typeFilter.size > 0;
  const resetFilters = () => {
    setSearchFilter("");
    setStartDate("");
    setEndDate("");
    setYearFilter("all");
    setTypeFilter(new Set());
  };

  // ── Export Excel ─────────────────────────────────────────────
  const handleExportExcel = () => {
    const rows = sortedTransactions.map(t => ({
      ...(hasPortfolioCodeColumn ? { Portefeuille: t.portfolioCode || "" } : {}),
      Date: formatDate(t.date),
      Code: t.code,
      Nom: t.name,
      Type: TYPE_LABELS[t.type as TransactionType] ?? t.type,
      Quantité: t.quantity,
      "Prix unitaire": t.unitPrice,
      Devise: t.currency,
      "Taux de change": t.conversionRate,
      Frais: t.fees,
      TFF: t.type === "vente" ? 0 : t.tff,
      Total: getTotal(t),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      ...(hasPortfolioCodeColumn ? [{ wch: 15 }] : []),
      { wch: 12 }, // Date
      { wch: 12 }, // Code
      { wch: 30 }, // Nom
      { wch: 12 }, // Type
      { wch: 10 }, // Quantité
      { wch: 14 }, // Prix unitaire
      { wch: 8 },  // Devise
      { wch: 14 }, // Taux de change
      { wch: 10 }, // Frais
      { wch: 10 }, // TFF
      { wch: 14 }, // Total
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historique");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `historique_transactions_${dateStr}.xlsx`);
  };

  const getTypeBadge = (type: Transaction["type"]) => {
    switch (type) {
      case "achat":     return <Badge variant="default">Achat</Badge>;
      case "vente":     return <Badge variant="destructive">Vente</Badge>;
      case "dividende": return <Badge className="bg-green-600">Dividende</Badge>;
      case "depot":     return <Badge className="bg-blue-600">Dépôt</Badge>;
      case "retrait":   return <Badge className="bg-orange-600">Retrait</Badge>;
      case "frais":     return <Badge className="bg-red-700">Frais</Badge>;
      case "interets":  return <Badge className="bg-teal-600">Intérêts</Badge>;
      default:          return <Badge>{type}</Badge>;
    }
  };

  const openEdit = (tx: Transaction) => {
    const portfolioId = (tx as any).portfolioId ?? currentPortfolioId ?? undefined;

    if (tx.type === "achat" || tx.type === "vente") {
      setTxDialogData({
        editId: tx.id,
        date: tx.date,
        code: tx.code,
        name: tx.name,
        type: tx.type,
        quantity: tx.quantity,
        unitPrice: tx.unitPrice,
        currency: tx.currency,
        conversionRate: tx.conversionRate,
        fees: tx.fees,
        tff: tx.tff,
        sector: (tx as any).sector ?? undefined,
        portfolioId,
      });
      setTxDialogOpen(true);
    } else if (tx.type === "dividende") {
      setDividendDialogData({
        editId: tx.id,
        date: tx.date,
        code: tx.code,
        name: tx.name,
        type: "dividende",
        quantity: tx.quantity,
        unitPrice: tx.unitPrice,
        currency: tx.currency,
        conversionRate: tx.conversionRate,
        tax: (tx as any).tax ?? 0,
        portfolioId,
      });
      setDividendOpen(true);
    } else {
      setEditing({
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
        portfolioId,
      });
      setEditOpen(true);
    }
  };

  const handleTxDialogEdit = async (updated: Transaction & { portfolioId?: string }) => {
    if (onEditTransaction) await onEditTransaction(updated as Transaction);
  };

  const handleSaved = async (updated: TransactionRow) => {
    if (onEditTransaction) {
      await onEditTransaction(updated as unknown as Transaction);
    }
    setEditOpen(false);
  };

  return (
    <Card>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucun mouvement enregistré</p>
        ) : (
          <div className="space-y-4 pt-4">
            {/* Ligne 1 : recherche + dates + export */}
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative flex-1 min-w-0 w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Rechercher par code ou nom..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background text-foreground"
              >
                <option value="all">Toutes les années</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="flex gap-2 items-center">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                <span className="text-muted-foreground">-</span>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" />Réinitialiser
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="ml-auto">
                <FileDown className="h-4 w-4 mr-1" />Exporter Excel
              </Button>
            </div>

            {/* Ligne 2 : filtres par type */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-muted-foreground">Type :</span>
              {ALL_TYPES.filter(t => presentTypes.has(t)).map(type => {
                const active = typeFilter.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                      active
                        ? `${TYPE_STYLES[type]} border-transparent`
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {TYPE_LABELS[type]}
                    {active && <span className="ml-1 opacity-70">×</span>}
                  </button>
                );
              })}
              {typeFilter.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {filteredTransactions.length} résultat{filteredTransactions.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}
                    <TableHead className={thClass} onClick={() => handleSort("date")}>Date <SortIcon col="date" /></TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("code")}>Code <SortIcon col="code" /></TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("name")}>Nom <SortIcon col="name" /></TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("type")}>Type <SortIcon col="type" /></TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("quantity")}>Quantité <SortIcon col="quantity" /></TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("unitPrice")}>Prix unitaire <SortIcon col="unitPrice" /></TableHead>
                    <TableHead className={thClass} onClick={() => handleSort("currency")}>Devise <SortIcon col="currency" /></TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("fees")}>Frais <SortIcon col="fees" /></TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("tff")}>TFF <SortIcon col="tff" /></TableHead>
                    <TableHead className={`text-right ${thClass}`} onClick={() => handleSort("total")}>Total <SortIcon col="total" /></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.length === 0 ? (
                    <TableRow>
                      <td colSpan={hasPortfolioCodeColumn ? 13 : 12} className="text-center py-8 text-muted-foreground">
                        Aucune transaction pour ces filtres
                      </td>
                    </TableRow>
                  ) : (
                    paginatedTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        {hasPortfolioCodeColumn && (
                          <TableCell className="font-medium">{transaction.portfolioCode || "-"}</TableCell>
                        )}
                        <TableCell>{formatDate(transaction.date)}</TableCell>
                        <TableCell className="font-medium">{transaction.code}</TableCell>
                        <TableCell>{transaction.name}</TableCell>
                        <TableCell>{getTypeBadge(transaction.type)}</TableCell>
                        <TableCell className="text-right">{transaction.quantity}</TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat("fr-FR", {
                            style: "currency",
                            currency: transaction.currency || portfolioCurrency,
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          }).format(transaction.unitPrice)}
                        </TableCell>
                        <TableCell>{transaction.currency}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.fees)}</TableCell>
                        <TableCell className="text-right">{transaction.type === "vente" ? "-" : formatCurrency(transaction.tff)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(getTotal(transaction))}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            {onEditTransaction && (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(transaction)}>
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {onDeleteTransaction && (
                              <Button variant="ghost" size="sm" onClick={() => onDeleteTransaction(transaction.id)}>
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  {sortedTransactions.length} transaction{sortedTransactions.length > 1 ? "s" : ""}
                  {hasActiveFilters ? " (filtrées)" : ""}
                  {" — "}page {safePage} / {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
                      ) : (
                        <Button key={p} variant={safePage === p ? "default" : "outline"} size="sm"
                          onClick={() => setCurrentPage(p as number)} className="w-8">{p}</Button>
                      )
                    )}
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>»</Button>
                </div>
              </div>
            )}

            <TransactionDialog
              open={txDialogOpen}
              onOpenChange={setTxDialogOpen}
              onEditTransaction={handleTxDialogEdit}
              currentPortfolio={currentPortfolio}
              portfolios={portfolios}
              initialData={txDialogData}
            />

            <DividendDialog
              open={dividendOpen}
              onOpenChange={setDividendOpen}
              onEditTransaction={handleTxDialogEdit}
              currentPortfolio={currentPortfolio}
              portfolios={portfolios}
              initialData={dividendDialogData}
            />

            <EditTransactionDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              transaction={editing}
              portfolios={portfolios}
              onSaved={handleSaved}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}