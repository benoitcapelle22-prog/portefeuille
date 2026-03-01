import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Portfolio } from "./PortfolioSelector";
import { Badge } from "./ui/badge";
import { Loader2, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

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
  tax?: number;
  portfolioCode?: string;
  sector?: string;
}

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">, portfolioId?: string) => void;
  currentPortfolio?: Portfolio;
  portfolios?: Portfolio[];
}

type QuoteStatus = "idle" | "loading" | "found" | "not_found" | "error";

export function TransactionForm({ onAddTransaction, currentPortfolio, portfolios }: TransactionFormProps) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"achat" | "vente" | "dividende" | "depot" | "retrait">("achat");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fees, setFees] = useState("");
  const [tff, setTff] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK">(
    currentPortfolio?.currency || "EUR"
  );
  const [conversionRate, setConversionRate] = useState("");
  const [tax, setTax] = useState("");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(currentPortfolio?.id || "");
  const [sector, setSector] = useState("");
  const [autoTFF, setAutoTFF] = useState(false);

  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("idle");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ pour ne pas écraser si tu modifies le champ nom
  const nameTouchedRef = useRef(false);
  const [nameAuto, setNameAuto] = useState(false);

  const selectedPortfolio = portfolios?.find(p => p.id === selectedPortfolioId) || currentPortfolio;

  // Recherche automatique : cours (api/quotes) + nom (api/ticker) + secteur (api/stock-search si dispo)
  useEffect(() => {
    const trimmed = code.trim().toUpperCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed || trimmed.length < 2) {
      setQuoteStatus("idle");
      setLivePrice(null);
      return;
    }

    setQuoteStatus("loading");

    debounceRef.current = setTimeout(async () => {
      try {
        const [quoteRes, tickerRes, stockRes] = await Promise.all([
          fetch(`/api/quotes?symbols=${encodeURIComponent(trimmed)}`).then(r => (r.ok ? r.json() : null)),
          fetch(`/api/ticker?symbol=${encodeURIComponent(trimmed)}`).then(r => (r.ok ? r.json() : null)),
          fetch(`/api/stock-search?q=${encodeURIComponent(trimmed)}`).then(r => (r.ok ? r.json() : null)),
        ]);

        // Cours
        const quotes: any[] = quoteRes?.quotes ?? [];
        const quote = quotes.find((q: any) => String(q.symbol || "").toUpperCase() === trimmed);
        const price = quote?.price ?? null;

        if (price != null) {
          setLivePrice(price);
          setQuoteStatus("found");
          if (!unitPrice) setUnitPrice(String(price));
        } else {
          setLivePrice(null);
          setQuoteStatus("not_found");
        }

        // ✅ Nom via /api/ticker
        const fetchedName = typeof tickerRes?.name === "string" ? tickerRes.name : null;
        if (fetchedName && !nameTouchedRef.current) {
          if (!name || nameAuto) {
            setName(fetchedName);
            setNameAuto(true);
          }
        }

        // Secteur (si dispo)
        if (!sector && stockRes?.sector) setSector(stockRes.sector);
      } catch {
        setLivePrice(null);
        setQuoteStatus("error");
      }
    }, 900);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (selectedPortfolio?.currency) {
      setCurrency(selectedPortfolio.currency as any);
      setConversionRate("");
    }
  }, [selectedPortfolioId, selectedPortfolio?.currency]);

  useEffect(() => {
    if (autoTFF && quantity && unitPrice && currency === "EUR" && type === "achat") {
      setTff(calculateTFF().toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTFF, quantity, unitPrice, currency, type]);

  useEffect(() => {
    if (quantity && unitPrice && (type === "achat" || type === "vente") && selectedPortfolio?.fees.defaultFeesPercent) {
      setFees(calculateFees().toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, unitPrice, currency, conversionRate, type, selectedPortfolio]);

  const currencySymbol = selectedPortfolio?.currency === "USD" ? "$" : "€";
  const showTFF = selectedPortfolio?.currency === "EUR";

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

  const calculatePRUInEuro = () => {
    if (type !== "achat") return 0;
    const qty = parseFloat(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;
    const feesVal = parseFloat(fees) || 0;
    const tffVal = parseFloat(tff) || 0;
    const convRate = parseFloat(conversionRate) || 1;
    return (qty * price * convRate + feesVal + tffVal) / qty;
  };

  const totalAmount = () => (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

  const calculateTFF = () => {
    if (!showTFF || !selectedPortfolio?.fees.defaultTFF || !quantity || !unitPrice || currency !== "EUR") return 0;
    return (parseFloat(quantity) * parseFloat(unitPrice) * selectedPortfolio.fees.defaultTFF) / 100;
  };

  const calculateFees = () => {
    if (!quantity || !unitPrice || !selectedPortfolio?.fees.defaultFeesPercent) return 0;
    const convRate = parseFloat(conversionRate) || 1;
    const total = parseFloat(quantity) * parseFloat(unitPrice) * convRate;
    return Math.max((total * selectedPortfolio.fees.defaultFeesPercent) / 100, selectedPortfolio.fees.defaultFeesMin || 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !quantity || !unitPrice) {
      alert("Veuillez remplir tous les champs obligatoires");
      return;
    }
    const calculatedTFF = type === "achat" && autoTFF ? (parseFloat(tff) || calculateTFF()) : 0;
    const calculatedFees = fees ? parseFloat(fees) : calculateFees();

    onAddTransaction(
      {
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
      },
      selectedPortfolio?.id
    );

    setCode("");
    setName("");
    setQuantity("");
    setUnitPrice("");
    setFees("");
    setTff("");
    setCurrency((selectedPortfolio?.currency as any) || "EUR");
    setConversionRate("");
    setTax("");
    setSector("");
    setAutoTFF(false);
    setQuoteStatus("idle");
    setLivePrice(null);

    // reset auto flags
    nameTouchedRef.current = false;
    setNameAuto(false);
  };

  const AutoBadge = () => <span className="text-xs font-normal text-green-600 ml-1">(auto)</span>;

  const QuoteIndicator = () => {
    if (quoteStatus === "idle") return null;
    if (quoteStatus === "loading") return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Recherche cours + infos...</span>
      </div>
    );
    if (quoteStatus === "found" && livePrice !== null) return (
      <div className="flex items-center gap-1.5 mt-1">
        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
        <span className="text-xs text-green-600 font-medium">Cours : {livePrice.toFixed(2)}</span>
        {unitPrice && parseFloat(unitPrice) !== livePrice && (
          <button type="button" onClick={() => setUnitPrice(String(livePrice))} className="text-xs text-blue-500 underline ml-1">
            Utiliser ce cours
          </button>
        )}
      </div>
    );
    if (quoteStatus === "not_found") return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-1">
        <XCircle className="h-3 w-3" />
        <span>Cours non trouvé — saisie manuelle</span>
      </div>
    );
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-500 mt-1">
        <XCircle className="h-3 w-3" />
        <span>Erreur API — saisie manuelle</span>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader />
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {portfolios && portfolios.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="portfolio">Portefeuille</Label>
                <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
                  <SelectTrigger id="portfolio"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code" className="flex items-center gap-1.5">
                Code <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </Label>
              <Input
                id="code"
                type="text"
                placeholder="Ex: MC.PA ou AAPL"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className={
                  quoteStatus === "found" ? "border-green-400 focus-visible:ring-green-300" :
                  quoteStatus === "not_found" ? "border-amber-400 focus-visible:ring-amber-300" :
                  quoteStatus === "error" ? "border-red-400 focus-visible:ring-red-300" : ""
                }
              />
              <QuoteIndicator />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center">
                Nom de l'action
                {nameAuto && name ? <AutoBadge /> : null}
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex: Apple Inc."
                value={name}
                onChange={(e) => {
                  nameTouchedRef.current = true;
                  setNameAuto(false);
                  setName(e.target.value);
                }}
                required
              />
            </div>

            {type === "achat" && (
              <div className="space-y-2">
                <Label htmlFor="sector" className="flex items-center">
                  Secteur d'activité
                </Label>
                <Input id="sector" type="text" placeholder="Ex: Technology" value={sector} onChange={(e) => setSector(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="type">Type mouvement</Label>
              <Select value={type} onValueChange={(value: any) => setType(value)}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
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
              <Input id="quantity" type="number" step="0.01" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitPrice">
                Cours ({transactionCurrencySymbol})
                {quoteStatus === "found" && livePrice !== null && (
                  <span className="ml-2 text-xs font-normal text-green-600">live: {livePrice.toFixed(2)}</span>
                )}
              </Label>
              <Input id="unitPrice" type="number" step="0.01" placeholder="0.00" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Select value={currency} onValueChange={(value: any) => setCurrency(value)}>
                <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
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
                <Input id="conversionRate" type="number" step="0.0001" placeholder="1.0000" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} />
              </div>
            )}

            {type === "achat" && showTFF && currency === "EUR" && (
              <div className="space-y-2">
                <Label>TFF Automatique</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={autoTFF ? "default" : "outline"} size="sm" onClick={() => { setAutoTFF(true); if (quantity && unitPrice) setTff(calculateTFF().toFixed(2)); }} className="flex-1">OUI</Button>
                  <Button type="button" variant={!autoTFF ? "default" : "outline"} size="sm" onClick={() => { setAutoTFF(false); setTff(""); }} className="flex-1">NON</Button>
                </div>
                {autoTFF && selectedPortfolio?.fees.defaultTFF && (
                  <Badge variant="secondary" className="text-xs">Taux: {selectedPortfolio.fees.defaultTFF}%</Badge>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fees">Frais ({currencySymbol})</Label>
              <Input id="fees" type="number" step="0.01" placeholder="0.00" value={fees} onChange={(e) => setFees(e.target.value)} />
              {selectedPortfolio?.fees.defaultFeesPercent && (
                <Badge variant="secondary" className="text-xs">
                  Auto: {selectedPortfolio.fees.defaultFeesPercent}% (min: {selectedPortfolio.fees.defaultFeesMin || 0}{currencySymbol})
                </Badge>
              )}
            </div>

            {showTFF && type === "achat" && currency === "EUR" && (
              <div className="space-y-2">
                <Label htmlFor="tff">TFF ({currencySymbol})</Label>
                <Input id="tff" type="number" step="0.01" placeholder="0.00" value={tff} onChange={(e) => setTff(e.target.value)} disabled={autoTFF} className={autoTFF ? "bg-muted" : ""} />
              </div>
            )}

            {type === "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="tax">Impôt ({transactionCurrencySymbol})</Label>
                <Input id="tax" type="number" step="0.01" placeholder="0.00" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-2">
              <Label>Montant total de l'opération ({transactionCurrencySymbol})</Label>
              <Input type="text" value={totalAmount().toFixed(2)} disabled className="bg-muted font-semibold" />
            </div>

            {currency !== selectedPortfolio?.currency && conversionRate && (
              <div className="space-y-2">
                <Label>Montant total converti ({currencySymbol})</Label>
                <Input type="text" value={(totalAmount() * (parseFloat(conversionRate) || 1)).toFixed(2)} disabled className="bg-muted font-semibold" />
              </div>
            )}

            {type === "achat" && (
              <div className="space-y-2 md:col-span-2">
                <Label>PRU en {currencySymbol}</Label>
                <Input type="text" value={quantity && unitPrice ? calculatePRUInEuro().toFixed(4) : "0.0000"} disabled className="bg-muted font-semibold" />
              </div>
            )}
          </div>

          <Button type="submit" className="w-full md:w-auto">Ajouter le mouvement</Button>
        </form>
      </CardContent>
    </Card>
  );
}