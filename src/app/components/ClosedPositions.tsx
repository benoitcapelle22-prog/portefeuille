import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "./TransactionForm";
import { Search, X, Eye, EyeOff, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

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
  portfolioCode?: string;
  sector?: string;
}

type SortKeyOp = "saleDate" | "code" | "name" | "sector" | "quantity" | "totalPurchase" | "totalSale" | "gainLoss" | "gainLossPercent";
type SortKeyTitle = "code" | "name" | "sector" | "totalPurchase" | "totalSale" | "gainLoss" | "gainLossPercent" | "dividends" | "totalWithDiv";
type SortDir = "asc" | "desc";

interface ClosedPositionsProps {
  closedPositions: ClosedPosition[];
  transactions: Transaction[];
  portfolioCurrency?: string;
}

const PAGE_SIZE = 10;

// ── Vue par opération ────────────────────────────────────────

function ByOperationView({ closedPositions, portfolioCurrency }: { closedPositions: ClosedPosition[]; portfolioCurrency: string }) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showSector, setShowSector] = useState(false);
  const [sortKey, setSortKey] = useState<SortKeyOp>("saleDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { setCurrentPage(1); }, [searchFilter, startDate, endDate, sortKey, sortDir]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: portfolioCurrency }).format(value);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR');
  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  const handleSort = (key: SortKeyOp) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKeyOp }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const Th = ({ col, children, className = "" }: { col: SortKeyOp; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 ${className}`} onClick={() => handleSort(col)}>
      {children}<SortIcon col={col} />
    </TableHead>
  );

  const filtered = closedPositions.filter(p => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch = searchFilter === "" || p.code.toLowerCase().includes(searchLower) || p.name.toLowerCase().includes(searchLower);
    const saleDate = new Date(p.saleDate);
    const matchesStart = !startDate || saleDate >= new Date(startDate);
    const matchesEnd = !endDate || saleDate <= new Date(endDate);
    return matchesSearch && matchesStart && matchesEnd;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey) {
      case "saleDate": aVal = new Date(a.saleDate).getTime(); bVal = new Date(b.saleDate).getTime(); break;
      case "code": aVal = a.code; bVal = b.code; break;
      case "name": aVal = a.name; bVal = b.name; break;
      case "sector": aVal = a.sector || ""; bVal = b.sector || ""; break;
      case "quantity": aVal = a.quantity; bVal = b.quantity; break;
      case "totalPurchase": aVal = a.totalPurchase; bVal = b.totalPurchase; break;
      case "totalSale": aVal = a.totalSale; bVal = b.totalSale; break;
      case "gainLoss": aVal = a.gainLoss; bVal = b.gainLoss; break;
      case "gainLossPercent": aVal = a.gainLossPercent; bVal = b.gainLossPercent; break;
      default: aVal = ""; bVal = "";
    }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, 'fr') : bVal.localeCompare(aVal, 'fr');
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const totalGainLoss = filtered.reduce((s, p) => s + p.gainLoss, 0);
  const totalInvested = filtered.reduce((s, p) => s + p.totalPurchase, 0);
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "";
  const hasPortfolioCol = closedPositions.some(p => p.portfolioCode);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input type="text" placeholder="Rechercher par code ou nom..." value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 items-center">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          <span className="text-muted-foreground">-</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSector(!showSector)}>
          {showSector ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}Secteur
        </Button>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={() => { setSearchFilter(""); setStartDate(""); setEndDate(""); }}>
            <X className="h-4 w-4 mr-1" />Réinitialiser
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
            <TableRow>
              {hasPortfolioCol && <TableHead>Portefeuille</TableHead>}
              <Th col="saleDate">Date de vente</Th>
              <Th col="code">Code</Th>
              <Th col="name">Nom</Th>
              {showSector && <Th col="sector">Secteur</Th>}
              <Th col="quantity" className="text-right">Nombre</Th>
              <Th col="totalPurchase" className="text-right">Montant investi</Th>
              <Th col="totalSale" className="text-right">Montant vente</Th>
              <Th col="gainLoss" className="text-right">+/- Value ({portfolioCurrency})</Th>
              <Th col="gainLossPercent" className="text-right">+/- Value %</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Aucune position clôturée</TableCell></TableRow>
            )}
            {paginated.map((p, i) => (
              <TableRow key={`${p.portfolioCode || ''}-${p.code}-${i}`}>
                {hasPortfolioCol && <TableCell className="font-medium">{p.portfolioCode || '-'}</TableCell>}
                <TableCell>{formatDate(p.saleDate)}</TableCell>
                <TableCell className="font-medium">{p.code}</TableCell>
                <TableCell>{p.name}</TableCell>
                {showSector && <TableCell>{p.sector}</TableCell>}
                <TableCell className="text-right">{p.quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.totalPurchase)}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.totalSale)}</TableCell>
                <TableCell className={`text-right ${p.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(p.gainLoss)}</TableCell>
                <TableCell className={`text-right ${p.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPercent(p.gainLossPercent)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-bold bg-muted/50">
              {hasPortfolioCol && <TableCell />}
              <TableCell colSpan={showSector ? 5 : 4}>TOTAL</TableCell>
              <TableCell className="text-right">{formatCurrency(totalInvested)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totalInvested + totalGainLoss)}</TableCell>
              <TableCell className={`text-right ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalGainLoss)}</TableCell>
              <TableCell className={`text-right ${totalGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPercent(totalGainLossPercent)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {sorted.length} position{sorted.length > 1 ? "s" : ""}{hasActiveFilters ? " (filtrées)" : ""}{" — "}page {safePage} / {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}><ChevronLeft className="h-4 w-4" /></Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) => p === "..." ? (
                <span key={`e-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
              ) : (
                <Button key={p} variant={safePage === p ? "default" : "outline"} size="sm"
                  onClick={() => setCurrentPage(p as number)} className="w-8">{p}</Button>
              ))}
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>»</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vue par titre ────────────────────────────────────────────

interface TitleRow {
  code: string;
  name: string;
  sector?: string;
  portfolioCode?: string;
  totalPurchase: number;
  totalSale: number;
  gainLoss: number;
  gainLossPercent: number;
  dividends: number;
  totalWithDiv: number;
  totalWithDivPercent: number;
  ops: number;
}

function ByTitleView({ closedPositions, transactions, portfolioCurrency }: { closedPositions: ClosedPosition[]; transactions: Transaction[]; portfolioCurrency: string }) {
  const [searchFilter, setSearchFilter] = useState("");
  const [showSector, setShowSector] = useState(false);
  const [sortKey, setSortKey] = useState<SortKeyTitle>("gainLoss");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { setCurrentPage(1); }, [searchFilter, sortKey, sortDir]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: portfolioCurrency }).format(value);
  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  // Regroupement par code + calcul des dividendes depuis transactions
  const titleRows: TitleRow[] = useMemo(() => {
    const map: Record<string, TitleRow> = {};

    for (const p of closedPositions) {
      const key = p.code;
      if (!map[key]) {
        map[key] = {
          code: p.code,
          name: p.name,
          sector: p.sector,
          portfolioCode: p.portfolioCode,
          totalPurchase: 0,
          totalSale: 0,
          gainLoss: 0,
          gainLossPercent: 0,
          dividends: 0,
          totalWithDiv: 0,
          totalWithDivPercent: 0,
          ops: 0,
        };
      }
      map[key].totalPurchase += p.totalPurchase;
      map[key].totalSale += p.totalSale;
      map[key].gainLoss += p.gainLoss;
      map[key].ops += 1;
    }

    // Ajout des dividendes depuis toutes les transactions de type dividende
    for (const t of transactions) {
      if (t.type !== "dividende") continue;
      const key = (t.code || "").trim().toUpperCase();
      const rowKey = Object.keys(map).find(k => k.trim().toUpperCase() === key);
      if (rowKey) {
        const amount = t.quantity * t.unitPrice * (t.conversionRate || 1) - ((t as any).tax || 0);
        map[rowKey].dividends += amount;
      }
    }

    // Calcul des totaux finaux
    return Object.values(map).map(row => {
      row.gainLossPercent = row.totalPurchase > 0 ? (row.gainLoss / row.totalPurchase) * 100 : 0;
      row.totalWithDiv = row.gainLoss + row.dividends;
      row.totalWithDivPercent = row.totalPurchase > 0 ? (row.totalWithDiv / row.totalPurchase) * 100 : 0;
      return row;
    });
  }, [closedPositions, transactions]);

  const handleSort = (key: SortKeyTitle) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKeyTitle }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const Th = ({ col, children, className = "" }: { col: SortKeyTitle; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 ${className}`} onClick={() => handleSort(col)}>
      {children}<SortIcon col={col} />
    </TableHead>
  );

  const filtered = titleRows.filter(r => {
    const sl = searchFilter.toLowerCase();
    return searchFilter === "" || r.code.toLowerCase().includes(sl) || r.name.toLowerCase().includes(sl);
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: any = (a as any)[sortKey] ?? "";
    let bVal: any = (b as any)[sortKey] ?? "";
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, 'fr') : bVal.localeCompare(aVal, 'fr');
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const totalGainLoss = filtered.reduce((s, r) => s + r.gainLoss, 0);
  const totalInvested = filtered.reduce((s, r) => s + r.totalPurchase, 0);
  const totalDividends = filtered.reduce((s, r) => s + r.dividends, 0);
  const totalWithDiv = totalGainLoss + totalDividends;
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
  const totalWithDivPercent = totalInvested > 0 ? (totalWithDiv / totalInvested) * 100 : 0;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasPortfolioCol = closedPositions.some(p => p.portfolioCode);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input type="text" placeholder="Rechercher par code ou nom..." value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSector(!showSector)}>
          {showSector ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}Secteur
        </Button>
        {searchFilter && (
          <Button variant="outline" size="sm" onClick={() => setSearchFilter("")}>
            <X className="h-4 w-4 mr-1" />Réinitialiser
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
            <TableRow>
              {hasPortfolioCol && <TableHead>Portefeuille</TableHead>}
              <Th col="code">Code</Th>
              <Th col="name">Nom</Th>
              {showSector && <Th col="sector">Secteur</Th>}
              <TableHead className="text-right text-muted-foreground text-xs">Opérations</TableHead>
              <Th col="totalPurchase" className="text-right">Montant investi</Th>
              <Th col="totalSale" className="text-right">Montant vente</Th>
              <Th col="gainLoss" className="text-right">+/- Value ({portfolioCurrency})</Th>
              <Th col="gainLossPercent" className="text-right">+/- Value %</Th>
              <Th col="dividends" className="text-right">Dividendes</Th>
              <Th col="totalWithDiv" className="text-right">Total (div. inclus)</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Aucune position clôturée</TableCell></TableRow>
            )}
            {paginated.map((r, i) => (
              <TableRow key={`${r.portfolioCode || ''}-${r.code}-${i}`}>
                {hasPortfolioCol && <TableCell className="font-medium">{r.portfolioCode || '-'}</TableCell>}
                <TableCell className="font-medium">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                {showSector && <TableCell>{r.sector}</TableCell>}
                <TableCell className="text-right text-muted-foreground text-xs">{r.ops}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.totalPurchase)}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.totalSale)}</TableCell>
                <TableCell className={`text-right ${r.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <div>{formatCurrency(r.gainLoss)}</div>
                  <div className="text-xs">{formatPercent(r.gainLossPercent)}</div>
                </TableCell>
                <TableCell className={`text-right ${r.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPercent(r.gainLossPercent)}</TableCell>
                <TableCell className="text-right text-blue-600">{formatCurrency(r.dividends)}</TableCell>
                <TableCell className={`text-right font-medium ${r.totalWithDiv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <div>{formatCurrency(r.totalWithDiv)}</div>
                  <div className="text-xs">{formatPercent(r.totalWithDivPercent)}</div>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-bold bg-muted/50">
              {hasPortfolioCol && <TableCell />}
              <TableCell colSpan={showSector ? 4 : 3}>TOTAL</TableCell>
              <TableCell className="text-right text-muted-foreground text-xs">{filtered.reduce((s, r) => s + r.ops, 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totalInvested)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totalInvested + totalGainLoss)}</TableCell>
              <TableCell className={`text-right ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <div>{formatCurrency(totalGainLoss)}</div>
                <div className="text-xs">{formatPercent(totalGainLossPercent)}</div>
              </TableCell>
              <TableCell className={`text-right ${totalGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPercent(totalGainLossPercent)}</TableCell>
              <TableCell className="text-right text-blue-600">{formatCurrency(totalDividends)}</TableCell>
              <TableCell className={`text-right font-medium ${totalWithDiv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <div>{formatCurrency(totalWithDiv)}</div>
                <div className="text-xs">{formatPercent(totalWithDivPercent)}</div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {sorted.length} titre{sorted.length > 1 ? "s" : ""}{" — "}page {safePage} / {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}><ChevronLeft className="h-4 w-4" /></Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) => p === "..." ? (
                <span key={`e-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
              ) : (
                <Button key={p} variant={safePage === p ? "default" : "outline"} size="sm"
                  onClick={() => setCurrentPage(p as number)} className="w-8">{p}</Button>
              ))}
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>»</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────

export function ClosedPositions({ closedPositions, transactions, portfolioCurrency = 'EUR' }: ClosedPositionsProps) {
  const [view, setView] = useState<"operations" | "titres">("operations");

  return (
    <Card>
      <CardContent>
        <div className="space-y-4 pt-4">
          {/* Sélecteur de vue */}
          <div className="flex gap-2 border-b pb-3">
            <button
              onClick={() => setView("operations")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === "operations"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Par opération
            </button>
            <button
              onClick={() => setView("titres")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === "titres"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Par titre (avec dividendes)
            </button>
          </div>

          {view === "operations"
            ? <ByOperationView closedPositions={closedPositions} portfolioCurrency={portfolioCurrency} />
            : <ByTitleView closedPositions={closedPositions} transactions={transactions} portfolioCurrency={portfolioCurrency} />
          }
        </div>
      </CardContent>
    </Card>
  );
}