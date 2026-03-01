import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import {
  MoreHorizontal,
  Search,
  X,
  Wallet,
  Plus,
  Minus,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  RefreshCw,
} from "lucide-react";
import { Transaction } from "./TransactionForm";
import { useExchangeRates } from "../hooks/useExchangeRates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useQuotes } from "../hooks/useQuotes";

export interface Position {
  code: string;
  name: string;
  quantity: number;
  totalCost: number;
  pru: number;
  currency?: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";
  currentPrice?: number;
  manualCurrentPrice?: number;
  totalValue?: number;
  latentGainLoss?: number;
  latentGainLossPercent?: number;
  stopLoss?: number;
  portfolioCode?: string;
  portfolioId?: string;
  sector?: string;
}

type SortKey =
  | "code"
  | "name"
  | "sector"
  | "currency"
  | "quantity"
  | "pru"
  | "currentPrice"
  | "totalCost"
  | "totalValue"
  | "latentGainLoss"
  | "stopLoss"
  | "risk";
type SortDir = "asc" | "desc";

interface CurrentPositionsProps {
  positions: Position[];
  portfolioCurrency?: string;
  onAction?: (action: "achat" | "vente" | "dividende", position: Position, portfolioId?: string) => void;
  transactions?: Transaction[];
  cash?: number;
  onUpdateCash?: (amount: number, type: "deposit" | "withdrawal", date: string) => void;
  portfolioCategory?: string;
  onUpdateStopLoss?: (code: string, stopLoss: number | undefined) => void;
  onUpdateCurrentPrice?: (code: string, manualCurrentPrice: number | undefined) => void;
  portfolioId?: string;
}

export function CurrentPositions({
  positions,
  portfolioCurrency = "EUR",
  onAction,
  transactions,
  cash = 0,
  onUpdateCash,
  portfolioCategory,
  onUpdateStopLoss,
  onUpdateCurrentPrice,
  portfolioId,
}: CurrentPositionsProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [showSector, setShowSector] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { rates, getConversionRate } = useExchangeRates();

  // Cours live (Alpha Vantage via /api/quotes) — refresh 2 min
  const symbols = useMemo(
    () => Array.from(new Set(positions.map((p) => (p.code || "").trim().toUpperCase()).filter(Boolean))),
    [positions]
  );

  const { quotesBySymbol, loading, error, refresh, updatedAt } = useQuotes(symbols, 120_000);

  // Label "il y a X min"
  const updatedAtLabel = useMemo(() => {
    if (!updatedAt) return null;
    const diffMin = Math.floor((Date.now() - updatedAt) / 60_000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin === 1) return "il y a 1 min";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const d = new Date(updatedAt);
    return `à ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }, [updatedAt]);

  // Positions enrichies : manuel > live > ancien prix
  const positionsWithPrices: Position[] = useMemo(() => {
    return positions.map((p) => {
      const sym = (p.code || "").trim().toUpperCase();
      const livePrice = quotesBySymbol[sym]?.price ?? undefined;
      const effectivePrice =
        p.manualCurrentPrice !== undefined
          ? p.manualCurrentPrice
          : livePrice !== undefined
            ? livePrice
            : p.currentPrice;

      if (effectivePrice === undefined || !Number.isFinite(effectivePrice)) return { ...p };

      const totalValue = p.quantity * effectivePrice;
      const latentGainLoss = totalValue - p.totalCost;
      const latentGainLossPercent = p.totalCost > 0 ? (latentGainLoss / p.totalCost) * 100 : 0;
      return { ...p, currentPrice: effectivePrice, totalValue, latentGainLoss, latentGainLossPercent };
    });
  }, [positions, quotesBySymbol]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3 ml-1" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-1" />
    );
  };

  const Th = ({ col, children, className = "" }: { col: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 ${className}`} onClick={() => handleSort(col)}>
      {children}
      <SortIcon col={col} />
    </TableHead>
  );

  const formatCurrency = (value?: number, currency?: string) => {
    if (value === undefined || value === null || Number.isNaN(value)) return "-";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || portfolioCurrency }).format(value);
  };

  const formatPercent = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(value)) return "-";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const filteredPositions = positionsWithPrices.filter((position) => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch =
      searchFilter === "" ||
      position.code.toLowerCase().includes(searchLower) ||
      position.name.toLowerCase().includes(searchLower);
    let matchesDateRange = true;
    if (transactions && endDate) {
      const purchases = transactions.filter((t) => t.type === "achat" && t.code === position.code);
      if (purchases.length > 0) matchesDateRange = purchases.some((p) => new Date(p.date) <= new Date(endDate));
    }
    return matchesSearch && matchesDateRange;
  });

  const getRisk = (pos: Position) => (pos.stopLoss !== undefined ? (pos.stopLoss - pos.pru) * pos.quantity : undefined);
  const getRiskPercent = (pos: Position) =>
    pos.stopLoss !== undefined && pos.pru > 0 ? ((pos.stopLoss - pos.pru) / pos.pru) * 100 : undefined;

  const sortedPositions = [...filteredPositions].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey) {
      case "code":
        aVal = a.code;
        bVal = b.code;
        break;
      case "name":
        aVal = a.name;
        bVal = b.name;
        break;
      case "sector":
        aVal = a.sector || "";
        bVal = b.sector || "";
        break;
      case "currency":
        aVal = a.currency || "";
        bVal = b.currency || "";
        break;
      case "quantity":
        aVal = a.quantity;
        bVal = b.quantity;
        break;
      case "pru":
        aVal = a.pru;
        bVal = b.pru;
        break;
      case "currentPrice":
        aVal = a.currentPrice ?? -Infinity;
        bVal = b.currentPrice ?? -Infinity;
        break;
      case "totalCost":
        aVal = a.totalCost;
        bVal = b.totalCost;
        break;
      case "totalValue":
        aVal = a.totalValue ?? -Infinity;
        bVal = b.totalValue ?? -Infinity;
        break;
      case "latentGainLoss":
        aVal = a.latentGainLoss ?? -Infinity;
        bVal = b.latentGainLoss ?? -Infinity;
        break;
      case "stopLoss":
        aVal = a.stopLoss ?? -Infinity;
        bVal = b.stopLoss ?? -Infinity;
        break;
      case "risk":
        aVal = getRisk(a) ?? -Infinity;
        bVal = getRisk(b) ?? -Infinity;
        break;
      default:
        aVal = "";
        bVal = "";
    }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, "fr") : bVal.localeCompare(aVal, "fr");
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const hasActiveFilters = searchFilter !== "" || endDate !== "";
  const resetFilters = () => {
    setSearchFilter("");
    setEndDate("");
  };

  const totalInvested = filteredPositions.reduce((sum, pos) => sum + pos.totalCost, 0);
  const totalValue = filteredPositions.reduce((sum, pos) => sum + (pos.totalValue || 0), 0);
  const totalLatentGainLoss = totalValue - totalInvested;
  const totalLatentGainLossPercent = totalInvested > 0 ? (totalLatentGainLoss / totalInvested) * 100 : 0;
  const totalPortfolio = totalValue + cash;
  const totalPortfolioInEUR = portfolioCurrency === "USD" ? totalPortfolio * getConversionRate("USD") : totalPortfolio;

  const totalRisk =
    portfolioCategory === "Trading"
      ? filteredPositions.reduce((sum, pos) => (pos.stopLoss !== undefined ? sum + (pos.stopLoss - pos.pru) * pos.quantity : sum), 0)
      : 0;

  // % risque total affiché sous la colonne "Risque"
  const totalRiskPercent = totalPortfolio > 0 ? (totalRisk / totalPortfolio) * 100 : 0;

  const handleSubmit = () => {
    if (!onUpdateCash) return;
    const amountValue = parseFloat(amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      alert("Veuillez saisir un montant valide");
      return;
    }
    if (type === "withdrawal" && amountValue > cash) {
      alert("Montant insuffisant dans les liquidités");
      return;
    }
    onUpdateCash(amountValue, type, date);
    setAmount("");
    setIsDialogOpen(false);
  };

  const hasPortfolioCodeColumn = positionsWithPrices.some((p) => p.portfolioCode);

  // Colspan dynamiques (évite les cassures quand on ajoute/enlève des colonnes)
  const prefixColSpan = 6 + (showSector ? 1 : 0) + (hasPortfolioCodeColumn ? 1 : 0);
  const totalColumnCount =
    10 + (showSector ? 1 : 0) + (hasPortfolioCodeColumn ? 1 : 0) + (portfolioCategory === "Trading" ? 2 : 0);

  return (
    <Card>
      <CardHeader></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filtres + indicateur cours live */}
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
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            <Button variant="outline" size="sm" onClick={() => setShowSector(!showSector)}>
              {showSector ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              Secteur
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <X className="h-4 w-4 mr-1" />
                Réinitialiser
              </Button>
            )}

            {/* Indicateur cours live */}
            {symbols.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                {error ? (
                  <span className="text-xs text-red-500" title={error}>
                    ⚠ Cours indisponibles
                  </span>
                ) : updatedAtLabel ? (
                  <span className="text-xs text-muted-foreground">Cours mis à jour {updatedAtLabel}</span>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refresh()}
                  disabled={loading}
                  title="Actualiser les cours"
                  className="h-7 px-2"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  <span className="ml-1 text-xs">{loading ? "..." : "Actualiser"}</span>
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}
                  <Th col="code">Code</Th>
                  <Th col="name">Nom</Th>
                  {showSector && <Th col="sector">Secteur</Th>}
                  <Th col="currency" className="text-center">
                    Devise
                  </Th>
                  <Th col="quantity" className="text-right">
                    Quantité
                  </Th>
                  <Th col="pru" className="text-right">
                    PRU ({portfolioCurrency})
                  </Th>
                  <Th col="currentPrice" className="text-right">
                    Cours actuel
                  </Th>
                  <Th col="totalCost" className="text-right">
                    Montant d'entrée
                  </Th>
                  <Th col="totalValue" className="text-right">
                    Valeur actuelle
                  </Th>

                  {/* Fusion : valeur + % en dessous */}
                  <Th col="latentGainLoss" className="text-right">
                    +/- Value latente
                  </Th>

                  {portfolioCategory === "Trading" && (
                    <>
                      <Th col="stopLoss" className="text-right">
                        Stop Loss
                      </Th>
                      {/* Fusion : risque € + risque % en dessous */}
                      <Th col="risk" className="text-right">
                        Risque
                      </Th>
                    </>
                  )}
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedPositions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={totalColumnCount} className="text-center py-8 text-muted-foreground">
                      Aucune position en cours
                    </TableCell>
                  </TableRow>
                )}

                {sortedPositions.map((position) => {
                  const positionCurrency = position.currency || portfolioCurrency;
                  const risk = getRisk(position);
                  const riskPercent = getRiskPercent(position);
                  const sym = (position.code || "").trim().toUpperCase();
                  const hasLivePrice = quotesBySymbol[sym]?.price != null && position.manualCurrentPrice === undefined;

                  const latentVal = position.latentGainLoss ?? 0;
                  const latentPct = position.latentGainLossPercent;

                  const riskVal = risk;
                  const riskPct = riskPercent;

                  return (
                    <TableRow key={`${position.portfolioCode || ""}-${position.code}`}>
                      {hasPortfolioCodeColumn && <TableCell className="font-medium">{position.portfolioCode || "-"}</TableCell>}
                      <TableCell className="font-medium">{position.code}</TableCell>
                      <TableCell>{position.name}</TableCell>
                      {showSector && <TableCell>{position.sector}</TableCell>}
                      <TableCell className="text-center">{positionCurrency}</TableCell>
                      <TableCell className="text-right">{position.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.pru, portfolioCurrency)}</TableCell>

                      {/* Cours actuel : input manuel + indication du prix live en dessous */}
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={hasLivePrice ? String(quotesBySymbol[sym]?.price?.toFixed(2)) : "Prix"}
                            value={position.manualCurrentPrice ?? ""}
                            onChange={(e) => {
                              const value = e.target.value === "" ? undefined : parseFloat(e.target.value);
                              onUpdateCurrentPrice?.(position.code, value);
                            }}
                            className="w-24 h-8 text-right"
                          />
                          {hasLivePrice && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              live: {quotesBySymbol[sym]?.price?.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">{formatCurrency(position.totalCost, portfolioCurrency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.totalValue, portfolioCurrency)}</TableCell>

                      {/* LATENT : valeur + % sous la valeur */}
                      <TableCell className="text-right whitespace-nowrap">
                        <div className={latentVal >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(position.latentGainLoss, portfolioCurrency)}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatPercent(latentPct)}</div>
                      </TableCell>

                      {portfolioCategory === "Trading" && (
                        <>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="SL"
                              value={position.stopLoss ?? ""}
                              onChange={(e) => {
                                const value = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                onUpdateStopLoss?.(position.code, value);
                              }}
                              className="w-20 h-8 text-right"
                            />
                          </TableCell>

                          {/* RISQUE : valeur + % sous la valeur */}
                          <TableCell className="text-right whitespace-nowrap">
                            <div
                              className={
                                (riskVal ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                              }
                            >
                              {riskVal !== undefined ? formatCurrency(riskVal, portfolioCurrency) : "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {riskPct !== undefined ? formatPercent(riskPct) : "-"}
                            </div>
                          </TableCell>
                        </>
                      )}

                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Ouvrir le menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onAction?.("achat", position, position.portfolioId || portfolioId)}>
                              Achat
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAction?.("vente", position, position.portfolioId || portfolioId)}>
                              Vente
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAction?.("dividende", position, position.portfolioId || portfolioId)}>
                              Dividende
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              <tfoot className="sticky bottom-0 z-[5]">
                {/* TOTAL */}
                <TableRow className="border-t-2 font-bold bg-muted/50">
                  <TableCell colSpan={prefixColSpan}>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalInvested, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalValue, portfolioCurrency)}</TableCell>

                  {/* TOTAL LATENT : valeur + % sous */}
                  <TableCell className="text-right whitespace-nowrap">
                    <div className={totalLatentGainLoss >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(totalLatentGainLoss, portfolioCurrency)}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totalLatentGainLossPercent)}</div>
                  </TableCell>

                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell></TableCell>

                      {/* TOTAL RISQUE : valeur + % sous */}
                      <TableCell className="text-right whitespace-nowrap">
                        <div className={totalRisk >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(totalRisk, portfolioCurrency)}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatPercent(totalRiskPercent)}</div>
                      </TableCell>
                    </>
                  )}

                  <TableCell></TableCell>
                </TableRow>

                {/* LIQUIDITÉS */}
                <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                  <TableCell colSpan={prefixColSpan} className="font-medium">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Liquidités
                      {onUpdateCash && (
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-1">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Gérer les liquidités</DialogTitle>
                              <DialogDescription>Effectuez un dépôt ou un retrait de liquidités</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="cash-date">Date</Label>
                                <Input id="cash-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="cash-type">Type d'opération</Label>
                                <Select value={type} onValueChange={(v: "deposit" | "withdrawal") => setType(v)}>
                                  <SelectTrigger id="cash-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="deposit">
                                      <div className="flex items-center gap-2">
                                        <Plus className="h-4 w-4 text-green-600" />
                                        Dépôt
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="withdrawal">
                                      <div className="flex items-center gap-2">
                                        <Minus className="h-4 w-4 text-red-600" />
                                        Retrait
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="cash-amount">Montant ({portfolioCurrency})</Label>
                                <Input
                                  id="cash-amount"
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={amount}
                                  onChange={(e) => setAmount(e.target.value)}
                                />
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Liquidités actuelles: <span className="font-medium">{formatCurrency(cash, portfolioCurrency)}</span>
                                <br />
                                Après opération:{" "}
                                <span className={`font-medium ${type === "deposit" ? "text-green-600" : "text-red-600"}`}>
                                  {formatCurrency(
                                    type === "deposit" ? cash + (parseFloat(amount) || 0) : cash - (parseFloat(amount) || 0),
                                    portfolioCurrency
                                  )}
                                </span>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Annuler
                              </Button>
                              <Button onClick={handleSubmit}>{type === "deposit" ? "Déposer" : "Retirer"}</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-right font-medium">-</TableCell>
                  <TableCell className="text-right font-medium text-blue-600">{formatCurrency(cash, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right">-</TableCell>

                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">-</TableCell>
                    </>
                  )}

                  <TableCell></TableCell>
                </TableRow>

                {/* TOTAL PORTEFEUILLE */}
                <TableRow className="border-t-2 font-bold bg-green-50 dark:bg-green-950/20">
                  <TableCell colSpan={prefixColSpan} className="text-lg">
                    TOTAL PORTEFEUILLE
                  </TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right text-lg text-green-600">{formatCurrency(totalPortfolio, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right"></TableCell>

                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell className="text-right"></TableCell>
                      <TableCell className="text-right"></TableCell>
                    </>
                  )}

                  <TableCell></TableCell>
                </TableRow>

                {/* TOTAL EN EUR */}
                {portfolioCurrency !== "EUR" && (
                  <TableRow className="font-bold bg-amber-50 dark:bg-amber-950/20">
                    <TableCell colSpan={prefixColSpan} className="text-sm italic">
                      TOTAL PORTEFEUILLE EN EUR (taux: {rates["USD"]?.toFixed(4)})
                    </TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right text-sm text-amber-700 dark:text-amber-400">{formatCurrency(totalPortfolioInEUR, "EUR")}</TableCell>
                    <TableCell className="text-right"></TableCell>

                    {portfolioCategory === "Trading" && (
                      <>
                        <TableCell className="text-right"></TableCell>
                        <TableCell className="text-right"></TableCell>
                      </>
                    )}

                    <TableCell></TableCell>
                  </TableRow>
                )}

                {/* RISQUE TOTAL (Trading) */}
                {portfolioCategory === "Trading" && (
                  <TableRow className="font-bold bg-red-50 dark:bg-red-950/20">
                    <TableCell colSpan={prefixColSpan} className="text-sm italic">
                      RISQUE TOTAL (Trading)
                    </TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right text-sm text-red-700 dark:text-red-400">{formatCurrency(totalRisk, portfolioCurrency)}</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </tfoot>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}