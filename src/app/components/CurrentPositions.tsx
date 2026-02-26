import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { MoreHorizontal, Search, X, Wallet, Plus, Minus, Eye, EyeOff } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export interface Position {
  code: string;
  name: string;
  quantity: number;
  totalCost: number;
  pru: number;
  currency?: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";
  currentPrice?: number;
  manualCurrentPrice?: number; // Prix saisi manuellement par l'utilisateur
  totalValue?: number;
  latentGainLoss?: number;
  latentGainLossPercent?: number;
  stopLoss?: number;
  portfolioCode?: string; // Code du portefeuille d'origine (en vue consolidée)
  portfolioId?: string; // ID du portefeuille d'origine (en vue consolidée)
  sector?: string; // Secteur d'activité
}

interface CurrentPositionsProps {
  positions: Position[];
  portfolioCurrency?: string;
  onAction?: (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => void;
  transactions?: Transaction[];
  cash?: number;
  onUpdateCash?: (amount: number, type: "deposit" | "withdrawal", date: string) => void;
  portfolioCategory?: string;
  onUpdateStopLoss?: (code: string, stopLoss: number | undefined) => void;
  onUpdateCurrentPrice?: (code: string, manualCurrentPrice: number | undefined) => void;
  portfolioId?: string; // ID du portefeuille actuel
}

export function CurrentPositions({ positions, portfolioCurrency = 'EUR', onAction, transactions, cash = 0, onUpdateCash, portfolioCategory, onUpdateStopLoss, onUpdateCurrentPrice, portfolioId }: CurrentPositionsProps) {
  const [positionsWithPrices, setPositionsWithPrices] = useState<Position[]>(positions);
  const [searchFilter, setSearchFilter] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSector, setShowSector] = useState(false); // Affichage colonne secteur
  
  // Utiliser le hook pour récupérer les taux de change en temps réel
  const { rates, getConversionRate, lastUpdate, error } = useExchangeRates();

  useEffect(() => {
    const updatePrices = () => {
      const updatedPositions = positions.map((position) => {
        // Utiliser uniquement le prix manuel saisi par l'utilisateur
        const effectivePrice = position.manualCurrentPrice;
        
        if (effectivePrice) {
          const totalValue = position.quantity * effectivePrice;
          const latentGainLoss = totalValue - position.totalCost;
          const latentGainLossPercent = (latentGainLoss / position.totalCost) * 100;
          
          return {
            ...position,
            currentPrice: effectivePrice,
            totalValue,
            latentGainLoss,
            latentGainLossPercent,
          };
        }
        return position;
      });
      setPositionsWithPrices(updatedPositions);
    };

    if (positions.length > 0) {
      updatePrices();
    }
  }, [positions]);

  const formatCurrency = (value?: number, currency?: string) => {
    if (value === undefined) return "-";
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || portfolioCurrency
    }).format(value);
  };

  const formatPercent = (value?: number) => {
    if (value === undefined) return "-";
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Filtrer les positions
  const filteredPositions = positionsWithPrices.filter(position => {
    const searchLower = searchFilter.toLowerCase();
    const matchesSearch = searchFilter === "" || 
      position.code.toLowerCase().includes(searchLower) ||
      position.name.toLowerCase().includes(searchLower);
    
    // Vérifier les dates des transactions d'achat pour cette position
    let matchesDateRange = true;
    if (transactions && endDate) {
      const positionPurchases = transactions.filter(
        t => t.type === "achat" && t.code === position.code
      );
      
      if (positionPurchases.length > 0) {
        matchesDateRange = positionPurchases.some(purchase => {
          const purchaseDate = new Date(purchase.date);
          const matchesEnd = !endDate || purchaseDate <= new Date(endDate);
          return matchesEnd;
        });
      }
    }
    
    return matchesSearch && matchesDateRange;
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
  
  // Conversion en EUR si le portefeuille est en USD
  const totalPortfolioInEUR = portfolioCurrency === 'USD' ? totalPortfolio * getConversionRate('USD') : totalPortfolio;

  // Calcul du risque total pour les portefeuilles Trading
  const totalRisk = portfolioCategory === "Trading" 
    ? filteredPositions.reduce((sum, pos) => {
        if (pos.stopLoss !== undefined) {
          const risk = (pos.stopLoss - pos.pru) * pos.quantity;
          return sum + risk;
        }
        return sum;
      }, 0)
    : 0;

  const handleSubmit = () => {
    if (!onUpdateCash) return;
    
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
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

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  {positionsWithPrices.some(p => p.portfolioCode) && (
                    <TableHead>Portefeuille</TableHead>
                  )}
                  <TableHead>Code</TableHead>
                  <TableHead>Nom</TableHead>
                  {showSector && <TableHead>Secteur</TableHead>}
                  <TableHead className="text-center">Devise</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">PRU ({portfolioCurrency})</TableHead>
                  <TableHead className="text-right">Cours actuel</TableHead>
                  <TableHead className="text-right">Montant d'entrée</TableHead>
                  <TableHead className="text-right">Valeur actuelle</TableHead>
                  <TableHead className="text-right">+/- Value latente</TableHead>
                  <TableHead className="text-right">% latent</TableHead>
                  {portfolioCategory === "Trading" && (
                    <>
                      <TableHead className="text-right">Stop Loss</TableHead>
                      <TableHead className="text-right">Risque</TableHead>
                      <TableHead className="text-right">Risque %</TableHead>
                    </>
                  )}
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={portfolioCategory === "Trading" ? 16 : 13} className="text-center py-8 text-muted-foreground">
                      Aucune position en cours
                    </TableCell>
                  </TableRow>
                )}
                {filteredPositions.map((position) => {
                  const positionCurrency = position.currency || portfolioCurrency;
                  const risk = position.stopLoss !== undefined 
                    ? (position.stopLoss - position.pru) * position.quantity 
                    : undefined;
                  const riskPercent = position.stopLoss !== undefined && position.pru > 0
                    ? ((position.stopLoss - position.pru) / position.pru) * 100
                    : undefined;
                  const hasPortfolioCodeColumn = positionsWithPrices.some(p => p.portfolioCode);
                  
                  return (
                    <TableRow key={`${position.portfolioCode || ''}-${position.code}`}>
                      {hasPortfolioCodeColumn && (
                        <TableCell className="font-medium">{position.portfolioCode || '-'}</TableCell>
                      )}
                      <TableCell className="font-medium">{position.code}</TableCell>
                      <TableCell>{position.name}</TableCell>
                      {showSector && <TableCell>{position.sector}</TableCell>}
                      <TableCell className="text-center">{positionCurrency}</TableCell>
                      <TableCell className="text-right">{position.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.pru, portfolioCurrency)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Prix"
                          value={position.manualCurrentPrice ?? position.currentPrice ?? ""}
                          onChange={(e) => {
                            const value = e.target.value === "" ? undefined : parseFloat(e.target.value);
                            onUpdateCurrentPrice?.(position.code, value);
                          }}
                          className="w-24 h-8 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(position.totalCost, portfolioCurrency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.totalValue, portfolioCurrency)}</TableCell>
                      <TableCell className={`text-right ${(position.latentGainLoss || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(position.latentGainLoss, portfolioCurrency)}
                      </TableCell>
                      <TableCell className={`text-right ${(position.latentGainLossPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(position.latentGainLossPercent)}
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
                          <TableCell className={`text-right ${(risk || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {risk !== undefined ? formatCurrency(risk, portfolioCurrency) : "-"}
                          </TableCell>
                          <TableCell className={`text-right ${(riskPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {riskPercent !== undefined ? formatPercent(riskPercent) : "-"}
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
                            <DropdownMenuItem onClick={() => onAction?.('achat', position, position.portfolioId || portfolioId)}>
                              Achat
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAction?.('vente', position, position.portfolioId || portfolioId)}>
                              Vente
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAction?.('dividende', position, position.portfolioId || portfolioId)}>
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
                <TableRow className="border-t-2 font-bold bg-muted/50">
                  <TableCell colSpan={showSector ? 7 : 6}>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalInvested, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalValue, portfolioCurrency)}</TableCell>
                  <TableCell className={`text-right ${totalLatentGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalLatentGainLoss, portfolioCurrency)}
                  </TableCell>
                  <TableCell className={`text-right ${totalLatentGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(totalLatentGainLossPercent)}
                  </TableCell>
                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell></TableCell>
                      <TableCell className={`text-right font-bold ${totalRisk >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalRisk, portfolioCurrency)}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${totalRisk >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(totalRisk / totalPortfolio * 100)}
                      </TableCell>
                    </>
                  )}
                  <TableCell></TableCell>
                </TableRow>
                <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                  <TableCell colSpan={showSector ? 7 : 6} className="font-medium">
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
                              <DialogDescription>
                                Effectuez un dépôt ou un retrait de liquidités
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="cash-date">Date</Label>
                                <Input
                                  id="cash-date"
                                  type="date"
                                  value={date}
                                  onChange={(e) => setDate(e.target.value)}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="cash-type">Type d'opération</Label>
                                <Select value={type} onValueChange={(value: "deposit" | "withdrawal") => setType(value)}>
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
                                <span className={`font-medium ${
                                  type === "deposit" ? "text-green-600" : "text-red-600"
                                }`}>
                                  {formatCurrency(
                                    type === "deposit"
                                      ? cash + (parseFloat(amount) || 0)
                                      : cash - (parseFloat(amount) || 0),
                                    portfolioCurrency
                                  )}
                                </span>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Annuler
                              </Button>
                              <Button onClick={handleSubmit}>
                                {type === "deposit" ? "Déposer" : "Retirer"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">-</TableCell>
                  <TableCell className="text-right font-medium text-blue-600">{formatCurrency(cash, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">-</TableCell>
                    </>
                  )}
                  <TableCell></TableCell>
                </TableRow>
                <TableRow className="border-t-2 font-bold bg-green-50 dark:bg-green-950/20">
                  <TableCell colSpan={showSector ? 7 : 6} className="text-lg">TOTAL PORTEFEUILLE</TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right text-lg text-green-600">{formatCurrency(totalPortfolio, portfolioCurrency)}</TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right"></TableCell>
                  {portfolioCategory === "Trading" && (
                    <>
                      <TableCell className="text-right"></TableCell>
                      <TableCell className="text-right"></TableCell>
                      <TableCell className="text-right"></TableCell>
                    </>
                  )}
                  <TableCell></TableCell>
                </TableRow>
                {portfolioCurrency !== 'EUR' && (
                  <TableRow className="font-bold bg-amber-50 dark:bg-amber-950/20">
                    <TableCell colSpan={showSector ? 7 : 6} className="text-sm italic">TOTAL PORTEFEUILLE EN EUR (taux: {rates['USD']?.toFixed(4)})</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right text-sm text-amber-700 dark:text-amber-400">{formatCurrency(totalPortfolioInEUR, 'EUR')}</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right"></TableCell>
                    {portfolioCategory === "Trading" && (
                      <>
                        <TableCell className="text-right"></TableCell>
                        <TableCell className="text-right"></TableCell>
                        <TableCell className="text-right"></TableCell>
                      </>
                    )}
                    <TableCell></TableCell>
                  </TableRow>
                )}
                {portfolioCategory === "Trading" && (
                  <TableRow className="font-bold bg-red-50 dark:bg-red-950/20">
                    <TableCell colSpan={showSector ? 7 : 6} className="text-sm italic">RISQUE TOTAL (Trading)</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right text-sm text-red-700 dark:text-red-400">{formatCurrency(totalRisk, portfolioCurrency)}</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right"></TableCell>
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