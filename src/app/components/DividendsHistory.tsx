import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EditDividendDialog, type DividendRow } from "./EditDividendDialog";

interface DividendsHistoryProps {
  transactions: Transaction[];
  portfolioCurrency?: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";
}

type SortKey =
  | "date"
  | "code"
  | "name"
  | "unitPrice"
  | "quantity"
  | "currency"
  | "conversionRate"
  | "totalAmount"
  | "taxAmount"
  | "netAmount";

type SortDir = "asc" | "desc";

type SortKeyByTitle = "code" | "name" | "totalAmount" | "taxAmount" | "netAmount" | "count";

export function DividendsHistory({ transactions, portfolioCurrency = "EUR" }: DividendsHistoryProps) {
  const [view, setView] = useState<"operations" | "titres">("operations");
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortKeyTitle, setSortKeyTitle] = useState<SortKeyByTitle>("netAmount");
  const [sortDirTitle, setSortDirTitle] = useState<SortDir>("desc");

  // ✅ local state pour refléter l’update sans dépendre du parent
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(transactions);

  // ✅ dialog edit dédiée dividende
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<DividendRow | null>(null);

  useEffect(() => {
    setLocalTransactions(transactions);
  }, [transactions]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const Th = ({ col, children, className = "" }: { col: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 ${className}`} onClick={() => handleSort(col)}>
      {children}
      <SortIcon col={col} />
    </TableHead>
  );

  const formatCurrency = (value: number, currency: string = portfolioCurrency) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("fr-FR");

  const dividends = localTransactions.filter(t => t.type === "dividende");

  const filteredDividends = dividends.filter(dividend => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch =
      searchFilter === "" ||
      dividend.code.toLowerCase().includes(searchLower) ||
      dividend.name.toLowerCase().includes(searchLower);
    const divDate = new Date(dividend.date);
    const matchesStartDate = !startDate || divDate >= new Date(startDate);
    const matchesEndDate = !endDate || divDate <= new Date(endDate);
    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const enriched = filteredDividends.map(d => ({
    ...d,
    totalAmount: (d.unitPrice * d.quantity) * d.conversionRate,
    taxAmount: (d.tax || 0) * d.conversionRate,
    netAmount: (d.unitPrice * d.quantity) * d.conversionRate - (d.tax || 0) * d.conversionRate,
  }));

  const sortedDividends = [...enriched].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey) {
      case "date": aVal = new Date(a.date).getTime(); bVal = new Date(b.date).getTime(); break;
      case "code": aVal = a.code; bVal = b.code; break;
      case "name": aVal = a.name; bVal = b.name; break;
      case "unitPrice": aVal = a.unitPrice; bVal = b.unitPrice; break;
      case "quantity": aVal = a.quantity; bVal = b.quantity; break;
      case "currency": aVal = a.currency; bVal = b.currency; break;
      case "conversionRate": aVal = a.conversionRate; bVal = b.conversionRate; break;
      case "totalAmount": aVal = a.totalAmount; bVal = b.totalAmount; break;
      case "taxAmount": aVal = a.taxAmount; bVal = b.taxAmount; break;
      case "netAmount": aVal = a.netAmount; bVal = b.netAmount; break;
      default: aVal = ""; bVal = "";
    }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, "fr") : bVal.localeCompare(aVal, "fr");
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const totalDividends = filteredDividends.reduce((sum, d) => sum + (d.unitPrice * d.quantity) * d.conversionRate, 0);
  const totalTax = filteredDividends.reduce((sum, d) => sum + (d.tax || 0) * d.conversionRate, 0);
  const totalNetDividends = totalDividends - totalTax;

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "";
  const resetFilters = () => { setSearchFilter(""); setStartDate(""); setEndDate(""); };

  // Vue par titre : agrégation par code
  const byTitleRows = useMemo(() => {
    const map: Record<string, { code: string; name: string; portfolioCode?: string; totalAmount: number; taxAmount: number; netAmount: number; count: number }> = {};
    for (const d of filteredDividends) {
      const key = `${d.portfolioCode || ""}-${d.code}`;
      const total = d.unitPrice * d.quantity * d.conversionRate;
      const tax = (d.tax || 0) * d.conversionRate;
      if (!map[key]) {
        map[key] = { code: d.code, name: d.name, portfolioCode: d.portfolioCode, totalAmount: 0, taxAmount: 0, netAmount: 0, count: 0 };
      }
      map[key].totalAmount += total;
      map[key].taxAmount += tax;
      map[key].netAmount += total - tax;
      map[key].count += 1;
    }
    return Object.values(map);
  }, [filteredDividends]);

  const sortedByTitle = [...byTitleRows].sort((a, b) => {
    const aVal = a[sortKeyTitle];
    const bVal = b[sortKeyTitle];
    if (typeof aVal === "string") return sortDirTitle === "asc" ? aVal.localeCompare(bVal as string, "fr") : (bVal as string).localeCompare(aVal, "fr");
    return sortDirTitle === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const handleSortTitle = (key: SortKeyByTitle) => {
    if (sortKeyTitle === key) setSortDirTitle(d => d === "asc" ? "desc" : "asc");
    else { setSortKeyTitle(key); setSortDirTitle("desc"); }
  };

  const SortIconTitle = ({ col }: { col: SortKeyByTitle }) => {
    if (sortKeyTitle !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDirTitle === "asc" ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const openEdit = (d: any) => {
    const row: DividendRow = {
      id: d.id,
      date: d.date,
      code: d.code,
      name: d.name,
      type: "dividende",
      quantity: d.quantity,
      unitPrice: d.unitPrice,
      currency: d.currency,
      conversionRate: d.conversionRate,
      tax: d.tax ?? 0,
      portfolioCode: d.portfolioCode ?? undefined,
    };
    setEditing(row);
    setEditOpen(true);
  };

  const hasPortfolioCodeColumn = transactions.some(t => t.portfolioCode);

  return (
    <Card>
      <CardContent>
        {dividends.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucun dividende enregistré</p>
        ) : (
          <div className="space-y-4 pt-4">

            {/* Sélecteur de vue */}
            <div className="flex gap-2 border-b pb-3">
              <button
                onClick={() => setView("operations")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${view === "operations" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Par opération
              </button>
              <button
                onClick={() => setView("titres")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${view === "titres" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Par titre
              </button>
            </div>

            {/* Filtres communs */}
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
            </div>

            {/* Vue par opération */}
            {view === "operations" && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}
                      <Th col="date">Date</Th>
                      <Th col="code">Code</Th>
                      <Th col="name">Nom</Th>
                      <Th col="unitPrice" className="text-right">Dividende / action</Th>
                      <Th col="quantity" className="text-right">Quantité</Th>
                      <Th col="currency">Devise</Th>
                      <Th col="conversionRate" className="text-right">Taux conv.</Th>
                      <Th col="totalAmount" className="text-right">Montant brut</Th>
                      <Th col="taxAmount" className="text-right">Impôt</Th>
                      <Th col="netAmount" className="text-right">Montant net</Th>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDividends.map((dividend: any) => (
                      <TableRow key={dividend.id}>
                        {hasPortfolioCodeColumn && (
                          <TableCell className="font-medium">{dividend.portfolioCode || "-"}</TableCell>
                        )}
                        <TableCell>{formatDate(dividend.date)}</TableCell>
                        <TableCell className="font-medium">{dividend.code}</TableCell>
                        <TableCell>{dividend.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(dividend.unitPrice, dividend.currency)}</TableCell>
                        <TableCell className="text-right">{dividend.quantity}</TableCell>
                        <TableCell>{dividend.currency}</TableCell>
                        <TableCell className="text-right">{Number(dividend.conversionRate).toFixed(4)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(dividend.totalAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(dividend.taxAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(dividend.netAmount)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(dividend)}>
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Vue par titre */}
            {view === "titres" && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSortTitle("code")}>
                        Code <SortIconTitle col="code" />
                      </TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSortTitle("name")}>
                        Nom <SortIconTitle col="name" />
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground text-xs cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSortTitle("count")}>
                        Versements <SortIconTitle col="count" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSortTitle("totalAmount")}>
                        Brut total <SortIconTitle col="totalAmount" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSortTitle("taxAmount")}>
                        Impôts total <SortIconTitle col="taxAmount" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSortTitle("netAmount")}>
                        Net total <SortIconTitle col="netAmount" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedByTitle.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun dividende pour ces filtres</TableCell></TableRow>
                    )}
                    {sortedByTitle.map((row) => (
                      <TableRow key={`${row.portfolioCode || ""}-${row.code}`}>
                        {hasPortfolioCodeColumn && <TableCell className="font-medium">{row.portfolioCode || "-"}</TableCell>}
                        <TableCell className="font-medium">{row.code}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">{row.count}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(row.totalAmount)}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">{formatCurrency(row.taxAmount)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{formatCurrency(row.netAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ✅ Dialog dédiée dividende */}
            <EditDividendDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              dividend={editing}
              onSaved={(updated) => {
                setLocalTransactions(prev => prev.map(t => (t.id === updated.id ? (updated as any) : t)));
              }}
            />

            <div className="mt-4 flex justify-end">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total des dividendes</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalDividends)}</p>
                <p className="text-sm text-muted-foreground">Impôts</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalTax)}</p>
                <p className="text-sm text-muted-foreground">Total net</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalNetDividends)}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}