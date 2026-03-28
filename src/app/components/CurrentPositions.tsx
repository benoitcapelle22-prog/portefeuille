import React, { useMemo, useState, useEffect, useRef } from "react";
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
  currency?: "EUR" | "USD" | "GBP" | "GBX" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";
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

// Alias pour compatibilité Dashboard (gainLoss / gainLossPercent)
export type { Position as PositionWithGainLoss };

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
  // ← NOUVEAU : callback pour remonter le total portefeuille valorisé au contexte
  onTotalPortfolioChange?: (total: number) => void;
}

function PriceInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const [raw, setRaw] = useState(value !== undefined ? String(value) : "");

  useEffect(() => {
    const parsed = raw === "" || raw === "." ? undefined : parseFloat(raw);
    if (parsed !== value) {
      setRaw(value !== undefined ? String(value) : "");
    }
  }, [value]);

  return (
    <input
      type="text"
      value={raw}
      onKeyDown={(e) => {
        if (e.key === ",") e.preventDefault();
      }}
      onChange={(e) => {
        const val = e.target.value.replace(",", ".");
        if (/^[\d]*\.?[\d]*$/.test(val)) {
          setRaw(val);
          const parsed = val === "" || val === "." ? undefined : parseFloat(val);
          onChange(parsed);
        }
      }}
      className="w-full border rounded px-2 py-1 text-sm text-right bg-background"
    />
  );
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
  onTotalPortfolioChange, // ← NOUVEAU
}: CurrentPositionsProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [showSector, setShowSector] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { rates, getConversionRate } = useExchangeRates();

  const symbols = useMemo(
    () => Array.from(new Set(positions.map((p) => (p.code || "").trim().toUpperCase()).filter(Boolean))),
    [positions]
  );

  const { quotesBySymbol, loading, error, refresh, updatedAt } = useQuotes(symbols, 120_000);

  const updatedAtLabel = useMemo(() => {
    if (!updatedAt) return null;
    const diffMin = Math.floor((Date.now() - updatedAt) / 60_000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin === 1) return "il y a 1 min";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const d = new Date(updatedAt);
    return `à ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }, [updatedAt]);

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
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc"
      ? <ChevronUp className="inline h-3 w-3 ml-1" />
      : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const Th = ({ col, children, className = "" }: { col: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 whitespace-normal text-xs leading-tight ${className}`}
      onClick={() => handleSort(col)}
    >
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

  // Recalcul des positions en fonction du filtre de date :
  // Si une date est sélectionnée, on rejoue toutes les transactions achat/vente
  // jusqu'à cette date pour recalculer quantité, totalCost et PRU.
  const recomputedPositions: Position[] = useMemo(() => {
    if (!endDate || !transactions || transactions.length === 0) {
      return positionsWithPrices;
    }

    const cutoff = new Date(endDate);
    cutoff.setHours(23, 59, 59, 999);

    // Rejouer les transactions achat/vente jusqu'à la date cutoff
    const posMap: Record<string, { quantity: number; totalCost: number; pru: number }> = {};

    const sorted = [...transactions]
      .filter(t => t.type === "achat" || t.type === "vente")
      .filter(t => new Date(t.date) <= cutoff)
      .sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        if (a.type === "achat" && b.type === "vente") return -1;
        if (a.type === "vente" && b.type === "achat") return 1;
        return 0;
      });

    for (const tx of sorted) {
      const code = (tx.code || "").trim().toUpperCase();
      const convertedPrice = tx.unitPrice * (tx.conversionRate || 1);

      if (tx.type === "achat") {
        const cost = tx.quantity * convertedPrice + (tx.fees || 0) + (tx.tff || 0);
        if (posMap[code]) {
          const newTotal = posMap[code].totalCost + cost;
          const newQty = posMap[code].quantity + tx.quantity;
          posMap[code] = { quantity: newQty, totalCost: newTotal, pru: newTotal / newQty };
        } else {
          posMap[code] = { quantity: tx.quantity, totalCost: cost, pru: cost / tx.quantity };
        }
      } else if (tx.type === "vente") {
        if (!posMap[code] || posMap[code].quantity < tx.quantity) continue;
        const newQty = posMap[code].quantity - tx.quantity;
        const removedCost = tx.quantity * posMap[code].pru;
        if (newQty === 0) {
          delete posMap[code];
        } else {
          posMap[code] = { quantity: newQty, totalCost: posMap[code].totalCost - removedCost, pru: posMap[code].pru };
        }
      }
    }

    // Reconstruire les positions en fusionnant avec les données existantes (cours, stopLoss, etc.)
    return Object.entries(posMap).map(([code, calc]) => {
      const existing = positionsWithPrices.find(p => (p.code || "").trim().toUpperCase() === code);
      const base: Position = existing
        ? { ...existing, quantity: calc.quantity, totalCost: calc.totalCost, pru: calc.pru }
        : { code, name: code, quantity: calc.quantity, totalCost: calc.totalCost, pru: calc.pru };

      // Recalculer totalValue et latentGainLoss avec le nouveau totalCost
      if (base.currentPrice !== undefined && Number.isFinite(base.currentPrice)) {
        const totalValue = base.quantity * base.currentPrice;
        return {
          ...base,
          totalValue,
          latentGainLoss: totalValue - calc.totalCost,
          latentGainLossPercent: calc.totalCost > 0 ? ((totalValue - calc.totalCost) / calc.totalCost) * 100 : 0,
        };
      }
      return { ...base, totalValue: undefined, latentGainLoss: undefined, latentGainLossPercent: undefined };
    });
  }, [endDate, transactions, positionsWithPrices]);

  const filteredPositions = recomputedPositions.filter((position) => {
    const searchLower = searchFilter.toLowerCase();
    return (
      searchFilter === "" ||
      position.code.toLowerCase().includes(searchLower) ||
      position.name.toLowerCase().includes(searchLower)
    );
  });

  const getRisk = (pos: Position) => (pos.stopLoss !== undefined ? (pos.stopLoss - pos.pru) * pos.quantity : undefined);
  const getRiskPercent = (pos: Position) =>
    pos.stopLoss !== undefined && pos.pru > 0 ? ((pos.stopLoss - pos.pru) / pos.pru) * 100 : undefined;

  const sortedPositions = [...filteredPositions].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortKey) {
      case "code": aVal = a.code; bVal = b.code; break;
      case "name": aVal = a.name; bVal = b.name; break;
      case "sector": aVal = a.sector || ""; bVal = b.sector || ""; break;
      case "currency": aVal = a.currency || ""; bVal = b.currency || ""; break;
      case "quantity": aVal = a.quantity; bVal = b.quantity; break;
      case "pru": aVal = a.pru; bVal = b.pru; break;
      case "currentPrice": aVal = a.currentPrice ?? -Infinity; bVal = b.currentPrice ?? -Infinity; break;
      case "totalCost": aVal = a.totalCost; bVal = b.totalCost; break;
      case "totalValue": aVal = a.totalValue ?? -Infinity; bVal = b.totalValue ?? -Infinity; break;
      case "latentGainLoss": aVal = a.latentGainLoss ?? -Infinity; bVal = b.latentGainLoss ?? -Infinity; break;
      case "stopLoss": aVal = a.stopLoss ?? -Infinity; bVal = b.stopLoss ?? -Infinity; break;
      case "risk": aVal = getRisk(a) ?? -Infinity; bVal = getRisk(b) ?? -Infinity; break;
      default: aVal = ""; bVal = "";
    }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, "fr") : bVal.localeCompare(aVal, "fr");
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const hasActiveFilters = searchFilter !== "" || endDate !== "";
  const resetFilters = () => { setSearchFilter(""); setEndDate(""); };

  // ── Helper : valeurs converties en devise portefeuille ───────
  const getPositionEurValues = (pos: Position) => {
    const posCurrency = pos.currency || portfolioCurrency;
    const isForeign = posCurrency !== portfolioCurrency;

    if (!isForeign) {
      return {
        totalValueConverted: pos.totalValue,
        totalValueRaw: undefined as number | undefined,
        latentGainLossConverted: pos.latentGainLoss,
        latentGainLossPercentConverted: pos.latentGainLossPercent,
      };
    }

    // getConversionRate retourne "1 EUR = ? devise", donc pour convertir devise → EUR on divise
    const convRate = getConversionRate(posCurrency);
    const totalValueRaw = pos.currentPrice !== undefined ? pos.quantity * pos.currentPrice : undefined;
    const totalValueConverted = totalValueRaw !== undefined && convRate > 0 ? totalValueRaw / convRate : undefined;
    const latentGainLossConverted = totalValueConverted !== undefined ? totalValueConverted - pos.totalCost : undefined;
    const latentGainLossPercentConverted =
      latentGainLossConverted !== undefined && pos.totalCost > 0
        ? (latentGainLossConverted / pos.totalCost) * 100
        : undefined;

    return { totalValueConverted, totalValueRaw, latentGainLossConverted, latentGainLossPercentConverted };
  };

  const totalInvested = filteredPositions.reduce((sum, pos) => sum + pos.totalCost, 0);
  const totalValue = filteredPositions.reduce((sum, pos) => sum + (getPositionEurValues(pos).totalValueConverted || 0), 0);
  const totalLatentGainLoss = filteredPositions.reduce((sum, pos) => sum + (getPositionEurValues(pos).latentGainLossConverted || 0), 0);
  const totalLatentGainLossPercent = totalInvested > 0 ? (totalLatentGainLoss / totalInvested) * 100 : 0;
  const totalPortfolio = totalValue + cash;
  const totalPortfolioInEUR = portfolioCurrency === "USD" ? totalPortfolio * getConversionRate("USD") : totalPortfolio;

  // ← NOUVEAU : remonter totalPortfolio au contexte dès qu'il change
  useEffect(() => {
    onTotalPortfolioChange?.(totalPortfolio);
  }, [totalPortfolio]);

  const totalRisk =
    portfolioCategory === "Trading"
      ? filteredPositions.reduce((sum, pos) => (pos.stopLoss !== undefined ? sum + (pos.stopLoss - pos.pru) * pos.quantity : sum), 0)
      : 0;
  const totalRiskPercent = totalPortfolio > 0 ? (totalRisk / totalPortfolio) * 100 : 0;

  const handleSubmit = () => {
    if (!onUpdateCash) return;
    const amountValue = parseFloat(amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) { alert("Veuillez saisir un montant valide"); return; }
    if (type === "withdrawal" && amountValue > cash) { alert("Montant insuffisant dans les liquidités"); return; }
    onUpdateCash(amountValue, type, date);
    setAmount("");
    setIsDialogOpen(false);
  };

  const hasPortfolioCodeColumn = positionsWithPrices.some((p) => p.portfolioCode);

  // prefixColSpan = colonnes avant "Montant d'entrée" dans le footer
  // Ordre : [Portefeuille?] Code, Nom, [Secteur?], [Devise?], Quantité, PRU → puis Montant d'entrée
  const prefixColSpan =
    4  // Code, Nom, Quantité, PRU
    + (hasPortfolioCodeColumn ? 1 : 0)
    + (showSector ? 1 : 0)
    + (showCurrency ? 1 : 0);

  const totalColumnCount =
    9
    + (hasPortfolioCodeColumn ? 1 : 0)
    + (showSector ? 1 : 0)
    + (showCurrency ? 1 : 0)
    + (portfolioCategory === "Trading" ? 2 : 0);

  return (
    <Card>
      <CardHeader></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filtres */}
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
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />

            <Button variant="outline" size="sm" onClick={() => setShowSector(!showSector)}>
              {showSector ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              Secteur
            </Button>

            <Button variant="outline" size="sm" onClick={() => setShowCurrency(!showCurrency)}>
              {showCurrency ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              Devise
            </Button>

            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <X className="h-4 w-4 mr-1" />Réinitialiser
              </Button>
            )}

            {symbols.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                {error ? (
                  <span className="text-xs text-red-500" title={error}>⚠ Cours indisponibles</span>
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

          <div className="overflow-x-auto max-h-[400px] md:max-h-[600px] overflow-y-auto relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  {hasPortfolioCodeColumn && <TableHead>Portefeuille</TableHead>}
                  <Th col="code">Code</Th>
                  <Th col="name">Nom</Th>
                  {showSector && <Th col="sector">Secteur</Th>}
                  {showCurrency && <Th col="currency" className="text-center">Devise</Th>}
                  <Th col="quantity" className="text-right">Quantité</Th>
                  <Th col="pru" className="text-right">PRU ({portfolioCurrency})</Th>
                  <Th col="totalCost" className="text-right w-20">
                    <span className="leading-tight">Montant<br />d'entrée</span>
                  </Th>
                  <Th col="currentPrice" className="text-right w-32">Cours actuel</Th>
                  <Th col="totalValue" className="text-right">Valeur actuelle</Th>
                  <Th col="latentGainLoss" className="text-right w-20">
                    <span className="leading-tight">+/- Value<br />latente</span>
                  </Th>
                  {portfolioCategory === "Trading" && (
                    <>
                      <Th col="stopLoss" className="text-right w-32">Stop Loss</Th>
                      <Th col="risk" className="text-right">Risque</Th>
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
                  const isForeign = positionCurrency !== portfolioCurrency;
                  const risk = getRisk(position);
                  const riskPercent = getRiskPercent(position);
                  const sym = (position.code || "").trim().toUpperCase();
                  const hasLivePrice = quotesBySymbol[sym]?.price != null && position.manualCurrentPrice === undefined;

                  const { totalValueConverted, totalValueRaw, latentGainLossConverted, latentGainLossPercentConverted } = getPositionEurValues(position);
                  const latentVal = latentGainLossConverted ?? 0;
                  const latentPct = latentGainLossPercentConverted;

                  return (
                    <TableRow key={`${position.portfolioCode || ""}-${position.code}`}>
                      {hasPortfolioCodeColumn && (
                        <TableCell className="font-medium">{position.portfolioCode || "-"}</TableCell>
                      )}

                      {/* Code + badge devise si étrangère */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {position.code}
                          {isForeign && (
                            <span className="bg-blue-100 text-blue-700 text-xs px-1.5 rounded-full dark:bg-blue-900/40 dark:text-blue-300">
                              {positionCurrency}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>{position.name}</TableCell>
                      {showSector && <TableCell>{position.sector}</TableCell>}
                      {showCurrency && <TableCell className="text-center">{positionCurrency}</TableCell>}
                      <TableCell className="text-right">{position.quantity}</TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: portfolioCurrency,
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4
                        }).format(position.pru)}
                      </TableCell>

                      {/* Montant d'entrée */}
                      <TableCell className="text-right">{formatCurrency(position.totalCost, portfolioCurrency)}</TableCell>

                      {/* Cours actuel + label live · DEVISE */}
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <PriceInput
                            value={position.manualCurrentPrice ?? position.currentPrice ?? undefined}
                            onChange={(value) => onUpdateCurrentPrice?.(position.code, value)}
                          />
                          {hasLivePrice && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              live{isForeign ? ` · ${positionCurrency}` : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Valeur actuelle : EUR + ligne secondaire devise action si étrangère */}
                      <TableCell className="text-right">
                        {formatCurrency(totalValueConverted, portfolioCurrency)}
                        {isForeign && totalValueRaw !== undefined && (
                          <div className="text-xs text-muted-foreground">
                            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: positionCurrency, maximumFractionDigits: 2 }).format(totalValueRaw)}
                          </div>
                        )}
                      </TableCell>

                      {/* +/- Value latente convertie */}
                      <TableCell className="text-right whitespace-nowrap">
                        <div className={latentVal >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(latentGainLossConverted, portfolioCurrency)}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatPercent(latentPct)}</div>
                      </TableCell>

                      {portfolioCategory === "Trading" && (
                        <>
                          <TableCell className="text-right">
                            <PriceInput
                              value={position.stopLoss}
                              onChange={(value) => onUpdateStopLoss?.(position.code, value)}
                            />
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className={(risk ?? 0) >= 0 ? "text-green-600" : "text-red-600"}>
                              {risk !== undefined ? formatCurrency(risk, portfolioCurrency) : "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {riskPercent !== undefined ? formatPercent(riskPercent) : "-"}
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
                  <TableCell className="text-right"></TableCell>{/* Cours actuel */}
                  <TableCell className="text-right">{formatCurrency(totalValue, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className={totalLatentGainLoss >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(totalLatentGainLoss, portfolioCurrency)}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totalLatentGainLossPercent)}</div>
                  </TableCell>
                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell></TableCell>
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
                                  <SelectTrigger id="cash-type"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="deposit">
                                      <div className="flex items-center gap-2">
                                        <Plus className="h-4 w-4 text-green-600" />Dépôt
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="withdrawal">
                                      <div className="flex items-center gap-2">
                                        <Minus className="h-4 w-4 text-red-600" />Retrait
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
                              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                              <Button onClick={handleSubmit}>{type === "deposit" ? "Déposer" : "Retirer"}</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">-</TableCell>{/* Montant d'entrée */}
                  <TableCell className="text-right font-medium">-</TableCell>{/* Cours actuel */}
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
                  <TableCell colSpan={prefixColSpan} className="text-lg">TOTAL PORTEFEUILLE</TableCell>
                  <TableCell className="text-right"></TableCell>{/* Montant d'entrée */}
                  <TableCell className="text-right"></TableCell>{/* Cours actuel */}
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
                    <TableCell className="text-right"></TableCell>{/* Montant d'entrée */}
                    <TableCell className="text-right"></TableCell>{/* Cours actuel */}
                    <TableCell className="text-right text-sm text-amber-700 dark:text-amber-400">
                      {formatCurrency(totalPortfolioInEUR, "EUR")}
                    </TableCell>
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
                    <TableCell colSpan={prefixColSpan} className="text-sm italic">RISQUE TOTAL (Trading)</TableCell>
                    <TableCell className="text-right"></TableCell>{/* Montant d'entrée */}
                    <TableCell className="text-right"></TableCell>{/* Cours actuel (vide) */}
                    <TableCell className="text-right"></TableCell>{/* Valeur actuelle */}
                    <TableCell className="text-right"></TableCell>{/* +/- Value latente */}
                    <TableCell className="text-right"></TableCell>{/* Stop Loss */}
                    <TableCell className="text-right text-sm text-red-700 dark:text-red-400">
                      {formatCurrency(totalRisk, portfolioCurrency)}
                    </TableCell>{/* Risque */}
                    <TableCell></TableCell>{/* Actions */}
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