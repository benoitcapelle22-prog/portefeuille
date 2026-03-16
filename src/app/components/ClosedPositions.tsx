import { useState, useEffect } from "react";
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

type SortKey = "saleDate" | "code" | "name" | "sector" | "quantity" | "totalPurchase" | "totalSale" | "gainLoss" | "gainLossPercent" | "dividends";
type SortDir = "asc" | "desc";

interface ClosedPositionsProps {
  closedPositions: ClosedPosition[];
  transactions: Transaction[];
  portfolioCurrency?: string;
}

const PAGE_SIZE = 10;

export function ClosedPositions({ closedPositions, transactions, portfolioCurrency = 'EUR' }: ClosedPositionsProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showSector, setShowSector] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("saleDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page quand les filtres ou le tri changent
  useEffect(() => {
    setCurrentPage(1);
  }, [searchFilter, startDate, endDate, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
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
      {children}<SortIcon col={col} />
    </TableHead>
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: portfolioCurrency }).format(value);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR');

  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

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

  const sortedPositions = [...filteredPositions].sort((a, b) => {
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
      case "dividends": aVal = a.dividends || 0; bVal = b.dividends || 0; break;
      default: aVal = ""; bVal = "";
    }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, 'fr') : bVal.localeCompare(aVal, 'fr');
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  // Totaux calculés sur toutes les positions filtrées (pas seulement la page courante)
  const totalGainLoss = filteredPositions.reduce((sum, pos) => sum + pos.gainLoss, 0);
  const totalInvested = filteredPositions.reduce((sum, pos) => sum + (pos.pru * pos.quantity), 0);
  const totalDividends = filteredPositions.reduce((sum, pos) => sum + (pos.dividends || 0), 0);
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedPositions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPositions = sortedPositions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const hasActiveFilters = searchFilter !== "" || startDate !== "" || endDate !== "";
  const resetFilters = () => { setSearchFilter(""); setStartDate(""); setEndDate(""); };

  const hasPortfolioCodeColumn = closedPositions.some(p => p.portfolioCode);

  return (
    <Card>
      <CardContent>
        <div className="space-y-4 pt-4">
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
            <Button variant="outline" size="sm" onClick={() => setShowSector(!showSector)} title={showSector ? "Masquer secteur" : "Afficher secteur"}>
              {showSector ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              Secteur
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <X className="h-4 w-4 mr-1" />Réinitialiser
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}
                  <Th col="saleDate">Date de vente</Th>
                  <Th col="code">Code</Th>
                  <Th col="name">Nom</Th>
                  {showSector && <Th col="sector">Secteur</Th>}
                  <Th col="quantity" className="text-right">Nombre</Th>
                  <Th col="totalPurchase" className="text-right">Montant investi</Th>
                  <Th col="totalSale" className="text-right">Montant vente</Th>
                  <Th col="gainLoss" className="text-right">+/- Value ({portfolioCurrency})</Th>
                  <Th col="gainLossPercent" className="text-right">+/- Value %</Th>
                  <Th col="dividends" className="text-right">Dividendes</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPositions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Aucune position clôturée</TableCell>
                  </TableRow>
                )}
                {paginatedPositions.map((position, index) => (
                  <TableRow key={`${position.portfolioCode || ''}-${position.code}-${index}`}>
                    {hasPortfolioCodeColumn && <TableCell className="font-medium">{position.portfolioCode || '-'}</TableCell>}
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
                ))}
                {/* Ligne TOTAL — toujours sur toutes les positions filtrées */}
                <TableRow className="border-t-2 font-bold bg-muted/50">
                  {hasPortfolioCodeColumn && <TableCell />}
                  <TableCell colSpan={showSector ? 5 : 4}>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalInvested)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalInvested + totalGainLoss)}</TableCell>
                  <TableCell className={`text-right ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalGainLoss)}</TableCell>
                  <TableCell className={`text-right ${totalGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPercent(totalGainLossPercent)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalDividends)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {sortedPositions.length} position{sortedPositions.length > 1 ? "s" : ""}
                {hasActiveFilters ? " (filtrées)" : ""}
                {" — "}page {safePage} / {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                >
                  «
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
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
                      <Button
                        key={p}
                        variant={safePage === p ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(p as number)}
                        className="w-8"
                      >
                        {p}
                      </Button>
                    )
                  )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  »
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
