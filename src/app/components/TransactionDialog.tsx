import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { Badge } from "./ui/badge";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTransaction: (transaction: Omit<Transaction, "id">, portfolioId?: string) => void;
  currentPortfolio?: Portfolio;
  portfolios?: Portfolio[];
  initialData?: {
    code?: string;
    name?: string;
    type?: "achat" | "vente" | "dividende";
    quantity?: number;
    portfolioId?: string; // ID du portefeuille
  };
}

export function TransactionDialog({ 
  open, 
  onOpenChange, 
  onAddTransaction, 
  currentPortfolio,
  portfolios,
  initialData 
}: TransactionDialogProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"achat" | "vente" | "dividende">("achat");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fees, setFees] = useState("");
  const [tff, setTff] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK">("EUR");
  const [conversionRate, setConversionRate] = useState("");
  const [tax, setTax] = useState("");
  const [autoTFF, setAutoTFF] = useState(false); // État pour le calcul automatique de la TFF

  // Déterminer le portefeuille à utiliser (priorité à initialData.portfolioId si currentPortfolio est undefined)
  const effectivePortfolio = currentPortfolio || 
    (initialData?.portfolioId && portfolios ? portfolios.find(p => p.id === initialData.portfolioId) : undefined);

  // Pré-remplir les champs quand le dialog s'ouvre
  useEffect(() => {
    if (open && initialData) {
      setCode(initialData.code || "");
      setName(initialData.name || "");
      setType(initialData.type || "achat");
      setQuantity(initialData.quantity?.toString() || "");
    }
  }, [open, initialData]);

  // Initialiser la devise par défaut selon le portefeuille actuel
  useEffect(() => {
    if (open && effectivePortfolio) {
      setCurrency(effectivePortfolio.currency as "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK");
      setConversionRate("1"); // Taux par défaut
    }
  }, [open, effectivePortfolio]);

  // Calculer automatiquement les frais pour les achats et ventes
  useEffect(() => {
    if (quantity && unitPrice && (type === "achat" || type === "vente") && effectivePortfolio?.fees.defaultFeesPercent) {
      const calculatedFees = calculateFees();
      setFees(calculatedFees.toFixed(2));
    }
  }, [quantity, unitPrice, currency, conversionRate, type, effectivePortfolio]);

  // Calculer automatiquement la TFF quand autoTFF est activé (uniquement pour les achats)
  useEffect(() => {
    if (autoTFF && quantity && unitPrice && currency === "EUR" && type === "achat") {
      const calculatedTFF = calculateTFF();
      setTff(calculatedTFF.toFixed(2));
    }
  }, [autoTFF, quantity, unitPrice, currency, type]);

  const currencySymbol = effectivePortfolio?.currency === "USD" ? "$" : "€";
  const showTFF = effectivePortfolio?.currency === "EUR";

  // Obtenir le symbole de la devise de transaction
  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case "USD": return "$";
      case "EUR": return "€";
      case "GBP": return "£";
      case "JPY": return "¥";
      default: return curr;
    }
  };

  const transactionCurrencySymbol = getCurrencySymbol(currency);

  // Calculer le PRU en euros (prix unitaire + frais et TFF répartis) - UNIQUEMENT POUR LES ACHATS
  const calculatePRUInEuro = () => {
    // Pas de calcul de PRU pour les ventes
    if (type !== "achat") {
      return 0;
    }

    const qty = parseFloat(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;
    const feesVal = parseFloat(fees) || 0;
    const tffVal = parseFloat(tff) || 0;
    const convRate = parseFloat(conversionRate) || 1;

    if (currency === effectivePortfolio?.currency) {
      return price + (feesVal + tffVal) / qty;
    } else {
      return price * convRate + (feesVal * convRate + tffVal) / qty;
    }
  };

  // Calculer le montant total de l'opération
  const totalAmount = () => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const feesVal = type === "dividende" ? 0 : (parseFloat(fees) || 0);
    const tffVal = type === "dividende" || type === "vente" ? 0 : (parseFloat(tff) || 0);
    
    if (type === "achat") {
      return qty * price + feesVal + tffVal;
    } else if (type === "vente") {
      // Pour une vente : pas de TFF
      return qty * price - feesVal;
    } else {
      // dividende
      return qty * price;
    }
  };

  // Calculer automatiquement le TFF en fonction du pourcentage défini
  const calculateTFF = () => {
    if (!showTFF || !effectivePortfolio?.fees.defaultTFF || !quantity || !unitPrice || currency !== "EUR") {
      return 0;
    }
    const totalAmount = parseFloat(quantity) * parseFloat(unitPrice);
    return (totalAmount * effectivePortfolio.fees.defaultTFF) / 100;
  };

  // Calculer les frais en fonction du pourcentage défini
  const calculateFees = () => {
    if (!effectivePortfolio?.fees.defaultFeesPercent || !quantity || !unitPrice) {
      return 0;
    }
    
    // Calculer les frais sur le montant CONVERTI dans la devise du portefeuille
    // Les frais sont toujours dans la devise du portefeuille
    const convRate = parseFloat(conversionRate) || 1;
    const totalAmountInPortfolioCurrency = parseFloat(quantity) * parseFloat(unitPrice) * convRate;
    const feesFromPercent = (totalAmountInPortfolioCurrency * effectivePortfolio.fees.defaultFeesPercent) / 100;
    
    // Si les frais calculés sont inférieurs au minimum, appliquer le minimum
    const minimumFees = effectivePortfolio.fees.defaultFeesMin || 0;
    return Math.max(feesFromPercent, minimumFees);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code || !name || !quantity || !unitPrice) {
      alert("Veuillez remplir tous les champs obligatoires");
      return;
    }

    // Calculer le TFF automatiquement si non renseigné (uniquement pour les achats)
    const calculatedTFF = (type === "achat" && autoTFF) ? (parseFloat(tff) || calculateTFF()) : 0;

    onAddTransaction({
      date,
      code: code.toUpperCase(),
      name,
      type,
      quantity: parseFloat(quantity),
      unitPrice: parseFloat(unitPrice),
      fees: parseFloat(fees) || effectivePortfolio?.fees.defaultFees || 0,
      tff: calculatedTFF,
      currency,
      conversionRate: parseFloat(conversionRate) || 1,
      tax: parseFloat(tax) || 0,
    }, initialData?.portfolioId);

    // Reset form et fermer le dialog
    setCode("");
    setName("");
    setQuantity("");
    setUnitPrice("");
    setFees("");
    setTff("");
    setCurrency("EUR");
    setConversionRate("");
    setTax("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle transaction</DialogTitle>
          <DialogDescription>
            Ajouter un mouvement de {
              type === "achat" ? "achat" : 
              type === "vente" ? "vente" : 
              "dividende"
            }
            {effectivePortfolio && (
              <span className="ml-2 font-medium text-primary">
                • {effectivePortfolio.name}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Ex: AAPL"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nom de l'action</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex: Apple Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {type !== "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="type">Type mouvement</Label>
                <Select value={type} onValueChange={(value: "achat" | "vente" | "dividende") => setType(value)}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="achat">Achat</SelectItem>
                    <SelectItem value="vente">Vente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quantity">{type === "dividende" ? "Nombre d'actions" : "Nombre"}</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitPrice">
                {type === "dividende" ? "Dividende par action" : "Cours"} ({transactionCurrencySymbol})
              </Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Select value={currency} onValueChange={(value: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK") => setCurrency(value)}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="JPY">JPY (¥)</SelectItem>
                  <SelectItem value="CAD">CAD ($)</SelectItem>
                  <SelectItem value="DKK">DKK (kr)</SelectItem>
                  <SelectItem value="SEK">SEK (kr)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currency !== effectivePortfolio?.currency && (
              <div className="space-y-2">
                <Label htmlFor="conversionRate">Taux de conversion (1 {currency} = ? {effectivePortfolio?.currency})</Label>
                <Input
                  id="conversionRate"
                  type="number"
                  step="0.0001"
                  placeholder="1.0000"
                  value={conversionRate}
                  onChange={(e) => setConversionRate(e.target.value)}
                />
              </div>
            )}

            {type !== "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="fees">Frais ({transactionCurrencySymbol})</Label>
                <Input
                  id="fees"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                />
                {effectivePortfolio?.fees.defaultFeesPercent && (
                  <Badge variant="secondary" className="text-xs">
                    Auto: {effectivePortfolio.fees.defaultFeesPercent}% (min: {effectivePortfolio.fees.defaultFeesMin || 0}{currencySymbol})
                  </Badge>
                )}
              </div>
            )}

            {showTFF && type === "achat" && currency === "EUR" && (
              <>
                <div className="space-y-2">
                  <Label>TFF Automatique</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={autoTFF ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setAutoTFF(true);
                        if (quantity && unitPrice) {
                          const calculatedTFF = calculateTFF();
                          setTff(calculatedTFF.toFixed(2));
                        }
                      }}
                      className="flex-1"
                    >
                      OUI
                    </Button>
                    <Button
                      type="button"
                      variant={!autoTFF ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setAutoTFF(false);
                        setTff("");
                      }}
                      className="flex-1"
                    >
                      NON
                    </Button>
                  </div>
                  {autoTFF && effectivePortfolio?.fees.defaultTFF && (
                    <Badge variant="secondary" className="text-xs">
                      Taux: {effectivePortfolio.fees.defaultTFF}%
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tff">TFF ({currencySymbol})</Label>
                  <Input
                    id="tff"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={tff}
                    onChange={(e) => setTff(e.target.value)}
                    disabled={autoTFF}
                  />
                </div>
              </>
            )}

            {type === "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="tax">Impôt ({transactionCurrencySymbol})</Label>
                <Input
                  id="tax"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="totalAmount">
                {type === "dividende" ? "Dividende brut" : "Montant total de l'opération"} ({transactionCurrencySymbol})
              </Label>
              <Input
                id="totalAmount"
                type="text"
                value={totalAmount().toFixed(2)}
                disabled
                className="bg-muted font-semibold"
              />
            </div>
            
            {type === "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="netDividend">Dividende net ({transactionCurrencySymbol})</Label>
                <Input
                  id="netDividend"
                  type="text"
                  value={(totalAmount() - (parseFloat(tax) || 0)).toFixed(2)}
                  disabled
                  className="bg-muted font-semibold"
                />
              </div>
            )}

            {type === "dividende" && currency !== effectivePortfolio?.currency && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="brutConverted">Dividende brut ({currencySymbol})</Label>
                  <Input
                    id="brutConverted"
                    type="text"
                    value={conversionRate ? (totalAmount() * (parseFloat(conversionRate) || 1)).toFixed(2) : "0.00"}
                    disabled
                    className="bg-muted font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="netConverted">Dividende net ({currencySymbol})</Label>
                  <Input
                    id="netConverted"
                    type="text"
                    value={conversionRate ? ((totalAmount() - (parseFloat(tax) || 0)) * (parseFloat(conversionRate) || 1)).toFixed(2) : "0.00"}
                    disabled
                    className="bg-muted font-semibold"
                  />
                </div>
              </>
            )}

            {currency !== effectivePortfolio?.currency && conversionRate && type !== "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="totalConverted">Montant total converti ({currencySymbol})</Label>
                <Input
                  id="totalConverted"
                  type="text"
                  value={(totalAmount() * (parseFloat(conversionRate) || 1)).toFixed(2)}
                  disabled
                  className="bg-muted font-semibold"
                />
              </div>
            )}

            {type === "achat" && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pruEuro">PRU en {currencySymbol}</Label>
                <Input
                  id="pruEuro"
                  type="text"
                  value={quantity && unitPrice ? calculatePRUInEuro().toFixed(4) : "0.0000"}
                  disabled
                  className="bg-muted font-semibold"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">
              Ajouter le mouvement
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}