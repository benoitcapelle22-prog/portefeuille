import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Portfolio } from "./PortfolioSelector";
import { Badge } from "./ui/badge";

export interface Transaction {
  id: string;
  date: string;
  code: string;
  name: string;
  type: "achat" | "vente" | "dividende" | "depot" | "retrait";
  quantity: number;
  unitPrice: number;
  fees: number;
  tff: number;
  currency: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";
  conversionRate: number;
  tax?: number; // Impôt pour les dividendes
  portfolioCode?: string; // Code du portefeuille d'origine (en vue consolidée)
  sector?: string; // Secteur d'activité
}

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">, portfolioId?: string) => void;
  currentPortfolio?: Portfolio;
  portfolios?: Portfolio[];
}

export function TransactionForm({ onAddTransaction, currentPortfolio, portfolios }: TransactionFormProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"achat" | "vente" | "dividende" | "depot" | "retrait">("achat");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fees, setFees] = useState("");
  const [tff, setTff] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK">(currentPortfolio?.currency || "EUR");
  const [conversionRate, setConversionRate] = useState("");
  const [tax, setTax] = useState("");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(currentPortfolio?.id || "");
  const [sector, setSector] = useState("");
  const [autoTFF, setAutoTFF] = useState(false); // État pour le calcul automatique de la TFF

  // Obtenir le portefeuille sélectionné
  const selectedPortfolio = portfolios?.find(p => p.id === selectedPortfolioId) || currentPortfolio;

  // Mettre à jour la devise de saisie quand le portefeuille change
  useEffect(() => {
    if (selectedPortfolio?.currency) {
      setCurrency(selectedPortfolio.currency);
      // Réinitialiser le taux de conversion car la devise a changé
      setConversionRate("");
    }
  }, [selectedPortfolioId, selectedPortfolio?.currency]);

  // Calculer automatiquement la TFF quand autoTFF est activé (uniquement pour les achats)
  useEffect(() => {
    if (autoTFF && quantity && unitPrice && currency === "EUR" && type === "achat") {
      const calculatedTFF = calculateTFF();
      setTff(calculatedTFF.toFixed(2));
    }
  }, [autoTFF, quantity, unitPrice, currency, type]);

  // Calculer automatiquement les frais pour les achats et ventes
  useEffect(() => {
    if (quantity && unitPrice && (type === "achat" || type === "vente") && selectedPortfolio?.fees.defaultFeesPercent) {
      const calculatedFees = calculateFees();
      setFees(calculatedFees.toFixed(2));
    }
  }, [quantity, unitPrice, currency, conversionRate, type, selectedPortfolio]);

  const currencySymbol = selectedPortfolio?.currency === "USD" ? "$" : "€";
  const showTFF = selectedPortfolio?.currency === "EUR";

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

  // Calculer le prix converti en EUR
  const convertedUnitPrice = unitPrice && conversionRate 
    ? parseFloat(unitPrice) * parseFloat(conversionRate) 
    : unitPrice ? parseFloat(unitPrice) : 0;

  // Calculer le PRU en euros (prix unitaire + frais et TFF répartis) - UNIQUEMENT POUR LES ACHATS
  const calculatePRUInEuro = () => {
    // Pas de calcul de PRU pour les ventes
    if (type !== "achat") {
      return 0;
    }

    const qty = parseFloat(quantity) || 1; // Éviter division par zéro
    const price = parseFloat(unitPrice) || 0;
    const feesVal = parseFloat(fees) || 0;
    const tffVal = parseFloat(tff) || 0;
    const convRate = parseFloat(conversionRate) || 1;

    // Le PRU = (montant converti + frais + TFF) / quantité
    // Les frais et TFF sont déjà dans la devise du portefeuille
    const montantConverti = qty * price * convRate;
    const totalCostInPortfolioCurrency = montantConverti + feesVal + tffVal;
    return totalCostInPortfolioCurrency / qty;
  };

  // Calculer le montant total de l'opération EN DEVISE (sans les frais)
  const totalAmount = () => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    
    // Le montant total en devise = nombre * cours (sans frais)
    return qty * price;
  };

  // Calculer automatiquement le TFF en fonction du pourcentage défini
  const calculateTFF = () => {
    if (!showTFF || !selectedPortfolio?.fees.defaultTFF || !quantity || !unitPrice || currency !== "EUR") {
      return 0;
    }
    const totalAmount = parseFloat(quantity) * parseFloat(unitPrice);
    return (totalAmount * selectedPortfolio.fees.defaultTFF) / 100;
  };

  // Calculer automatiquement les frais en fonction du pourcentage et du minimum
  const calculateFees = () => {
    if (!quantity || !unitPrice) {
      return 0;
    }
    
    // Si pas de pourcentage défini, retourner 0
    if (!selectedPortfolio?.fees.defaultFeesPercent) {
      return 0;
    }
    
    // Calculer les frais sur le montant CONVERTI dans la devise du portefeuille
    // Les frais sont toujours dans la devise du portefeuille
    const convRate = parseFloat(conversionRate) || 1;
    const totalAmountInPortfolioCurrency = parseFloat(quantity) * parseFloat(unitPrice) * convRate;
    const feesFromPercent = (totalAmountInPortfolioCurrency * selectedPortfolio.fees.defaultFeesPercent) / 100;
    
    // Si les frais calculés sont inférieurs au minimum, appliquer le minimum
    const minimumFees = selectedPortfolio.fees.defaultFeesMin || 0;
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
    
    // Calculer les frais automatiquement si non renseignés
    const calculatedFees = fees ? parseFloat(fees) : calculateFees();

    onAddTransaction({
      date,
      code: code.toUpperCase(),
      name,
      type,
      quantity: parseFloat(quantity),
      unitPrice: parseFloat(unitPrice),
      fees: calculatedFees,
      tff: calculatedTFF,
      currency,
      conversionRate: parseFloat(conversionRate) || 1,
      tax: type === "dividende" ? parseFloat(tax) : undefined,
      portfolioCode: selectedPortfolio?.code,
      sector: sector || undefined,
    }, selectedPortfolio?.id);

    // Reset form
    setCode("");
    setName("");
    setQuantity("");
    setUnitPrice("");
    setFees("");
    setTff("");
    setCurrency(selectedPortfolio?.currency || "EUR");
    setConversionRate("");
    setTax("");
    setSector("");
    setAutoTFF(false);
  };

  return (
    <Card>
      <CardHeader>
        
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {portfolios && portfolios.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="portfolio">Portefeuille</Label>
                <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
                  <SelectTrigger id="portfolio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolios.map((portfolio) => (
                      <SelectItem key={portfolio.id} value={portfolio.id}>
                        {portfolio.name} ({portfolio.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            <div className="space-y-2">
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

            {type === "achat" && (
              <div className="space-y-2">
                <Label htmlFor="sector">Secteur d'activité</Label>
                <Input
                  id="sector"
                  type="text"
                  placeholder="Ex: Technologie"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="type">Type mouvement</Label>
              <Select value={type} onValueChange={(value: "achat" | "vente" | "dividende" | "depot" | "retrait") => setType(value)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="achat">Achat</SelectItem>
                  <SelectItem value="vente">Vente</SelectItem>
                  <SelectItem value="dividende">Dividende</SelectItem>
                  <SelectItem value="depot">Dépôt</SelectItem>
                  <SelectItem value="retrait">Retrait</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Nombre</Label>
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
              <Label htmlFor="unitPrice">Cours ({transactionCurrencySymbol})</Label>
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

            {currency !== selectedPortfolio?.currency && (
              <div className="space-y-2">
                <Label htmlFor="conversionRate">Taux de conversion (1 {currency} = ? {selectedPortfolio?.currency})</Label>
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

            {/* TFF Automatique - uniquement pour les achats en EUR */}
            {type === "achat" && showTFF && currency === "EUR" && (
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
                {autoTFF && selectedPortfolio?.fees.defaultTFF && (
                  <Badge variant="secondary" className="text-xs">
                    Taux: {selectedPortfolio.fees.defaultTFF}%
                  </Badge>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fees">Frais ({currencySymbol})</Label>
              <Input
                id="fees"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
              {selectedPortfolio?.fees.defaultFeesPercent && (
                <Badge variant="secondary" className="text-xs">
                  Auto: {selectedPortfolio.fees.defaultFeesPercent}% (min: {selectedPortfolio.fees.defaultFeesMin || 0}{currencySymbol})
                </Badge>
              )}
            </div>

            {showTFF && type === "achat" && currency === "EUR" && (
              <>
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
                    className={autoTFF ? "bg-muted" : ""}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Montant total de l'opération ({transactionCurrencySymbol})</Label>
              <Input
                id="totalAmount"
                type="text"
                value={totalAmount().toFixed(2)}
                disabled
                className="bg-muted font-semibold"
              />
            </div>
            
            {currency !== selectedPortfolio?.currency && conversionRate && (
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

            {/* Afficher le PRU uniquement pour les achats */}
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

          <Button type="submit" className="w-full md:w-auto">
            Ajouter le mouvement
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}