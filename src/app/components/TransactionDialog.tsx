import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { Loader2 } from "lucide-react";

const SECTORS = ["Finance", "Technology", "Santé", "Énergie", "Industrie"];

// Correspondance noms Yahoo Finance → valeurs du menu déroulant
const SECTOR_MAP: Record<string, string> = {
  "Technology":          "Technology",
  "Financial Services":  "Finance",
  "Finance":             "Finance",
  "Healthcare":          "Santé",
  "Health Care":         "Santé",
  "Energy":              "Énergie",
  "Industrials":         "Industrie",
  "Industrial":          "Industrie",
};

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
    portfolioId?: string;
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export function TransactionDialog({
  open,
  onOpenChange,
  onAddTransaction,
  currentPortfolio,
  portfolios,
  initialData,
}: TransactionDialogProps) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
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
  const [sector, setSector] = useState("");
  const [sectorLoading, setSectorLoading] = useState(false);
  const [autoTFF, setAutoTFF] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectivePortfolio =
    currentPortfolio ||
    (initialData?.portfolioId && portfolios
      ? portfolios.find((p) => p.id === initialData.portfolioId)
      : undefined);

  // Pré-remplir les champs quand le dialog s'ouvre
  useEffect(() => {
    if (open && initialData) {
      setCode(initialData.code || "");
      setName(initialData.name || "");
      setType(initialData.type || "achat");
      setQuantity(initialData.quantity?.toString() || "");
    }
  }, [open, initialData]);

  // Initialiser la devise par défaut
  useEffect(() => {
    if (open && effectivePortfolio) {
      setCurrency(effectivePortfolio.currency as "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK");
      setConversionRate("1");
    }
  }, [open, effectivePortfolio]);

  // Calcul automatique des frais
  useEffect(() => {
    if (quantity && unitPrice && (type === "achat" || type === "vente") && effectivePortfolio?.fees.defaultFeesPercent) {
      setFees(calculateFees().toFixed(2));
    }
  }, [quantity, unitPrice, currency, conversionRate, type, effectivePortfolio]);

  // Calcul automatique de la TFF si autoTFF activé
  useEffect(() => {
    if (autoTFF && quantity && unitPrice && currency === "EUR" && type === "achat") {
      setTff(calculateTFF().toFixed(2));
    }
  }, [autoTFF, quantity, unitPrice, currency, type]);

  // Lookup Yahoo Finance : nom + secteur au changement de code
  useEffect(() => {
    const trimmed = code.trim().toUpperCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed || trimmed.length < 2) {
      setSectorLoading(false);
      return;
    }

    setSectorLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/yahoo-search?q=${encodeURIComponent(trimmed)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (res?.name && !initialData?.name) setName(res.name);
        if (res?.sector) {
          const mapped = SECTOR_MAP[res.sector] || res.sector;
          setSector(SECTORS.includes(mapped) ? mapped : "");
        }
      } finally {
        setSectorLoading(false);
      }
    }, 900);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [code]);

  const currencySymbol = effectivePortfolio?.currency === "USD" ? "$" : "€";
  const showTFF = effectivePortfolio?.currency === "EUR";

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

  const calculateFees = () => {
    if (!effectivePortfolio?.fees.defaultFeesPercent || !quantity || !unitPrice) return 0;
    const convRate = parseFloat(conversionRate) || 1;
    const total = parseFloat(quantity) * parseFloat(unitPrice) * convRate;
    const fromPercent = (total * effectivePortfolio.fees.defaultFeesPercent) / 100;
    return Math.max(fromPercent, effectivePortfolio.fees.defaultFeesMin || 0);
  };

  const calculateTFF = () => {
    if (!showTFF || !effectivePortfolio?.fees.defaultTFF || !quantity || !unitPrice || currency !== "EUR") return 0;
    return (parseFloat(quantity) * parseFloat(unitPrice) * effectivePortfolio.fees.defaultTFF) / 100;
  };

  const totalAmount = () => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const feesVal = type === "dividende" ? 0 : parseFloat(fees) || 0;
    const tffVal = type === "dividende" || type === "vente" ? 0 : parseFloat(tff) || 0;
    if (type === "achat") return qty * price + feesVal + tffVal;
    if (type === "vente") return qty * price - feesVal;
    return qty * price;
  };

  const calculatePRU = () => {
    if (type !== "achat") return 0;
    const qty = parseFloat(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;
    const feesVal = parseFloat(fees) || 0;
    const tffVal = parseFloat(tff) || 0;
    const convRate = parseFloat(conversionRate) || 1;
    if (currency === effectivePortfolio?.currency) return price + (feesVal + tffVal) / qty;
    return price * convRate + (feesVal * convRate + tffVal) / qty;
  };

  // Détail du calcul des frais
  const feesDetail = () => {
    if (!effectivePortfolio?.fees.defaultFeesPercent || !quantity || !unitPrice) return null;
    const convRate = parseFloat(conversionRate) || 1;
    const total = parseFloat(quantity) * parseFloat(unitPrice) * convRate;
    const fromPercent = (total * effectivePortfolio.fees.defaultFeesPercent) / 100;
    const min = effectivePortfolio.fees.defaultFeesMin || 0;
    const applied = Math.max(fromPercent, min);
    const isMin = fromPercent < min;
    return {
      total: total.toFixed(2),
      percent: effectivePortfolio.fees.defaultFeesPercent,
      fromPercent: fromPercent.toFixed(2),
      min,
      applied: applied.toFixed(2),
      isMin,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !quantity || !unitPrice) {
      alert("Veuillez remplir tous les champs obligatoires");
      return;
    }
    const calculatedTFF = type === "achat" && autoTFF ? parseFloat(tff) || calculateTFF() : 0;
    onAddTransaction(
      {
        date,
        code: code.toUpperCase(),
        name,
        type,
        quantity: parseFloat(quantity),
        unitPrice: parseFloat(unitPrice),
        fees: parseFloat(fees) || 0,
        tff: calculatedTFF,
        currency,
        conversionRate: parseFloat(conversionRate) || 1,
        tax: parseFloat(tax) || 0,
        sector: sector || undefined,
      },
      initialData?.portfolioId
    );
    // Reset
    setCode(""); setName(""); setSector(""); setQuantity(""); setUnitPrice("");
    setFees(""); setTff(""); setCurrency("EUR"); setConversionRate(""); setTax("");
    setAutoTFF(false);
    onOpenChange(false);
  };

  const detail = feesDetail();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle transaction</DialogTitle>
          <DialogDescription>
            {effectivePortfolio && (
              <span className="font-medium text-primary">{effectivePortfolio.name}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── IDENTIFICATION ── */}
          <SectionTitle>Identification</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" type="text" placeholder="Ex: AAPL" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nom de l'action</Label>
              <Input id="name" type="text" placeholder="Ex: Apple Inc." value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {type === "achat" && (
              <div className="space-y-2">
                <Label htmlFor="sector" className="flex items-center gap-2">
                  Secteur
                  {sectorLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger id="sector">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ── TRANSACTION ── */}
          <SectionTitle>Transaction</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            {type !== "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="type">Type mouvement</Label>
                <Select value={type} onValueChange={(v: "achat" | "vente" | "dividende") => setType(v)}>
                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="achat">Achat</SelectItem>
                    <SelectItem value="vente">Vente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="quantity">{type === "dividende" ? "Nombre d'actions" : "Nombre"}</Label>
              <Input id="quantity" type="number" step="0.01" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">
                {type === "dividende" ? "Dividende par action" : "Cours"} ({transactionCurrencySymbol})
              </Label>
              <Input id="unitPrice" type="number" step="0.01" placeholder="0.00" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Select value={currency} onValueChange={(v: "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK") => setCurrency(v)}>
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
            {currency !== effectivePortfolio?.currency && (
              <div className="space-y-2 col-span-2">
                <Label htmlFor="conversionRate">Taux de conversion (1 {currency} = ? {effectivePortfolio?.currency})</Label>
                <Input id="conversionRate" type="number" step="0.0001" placeholder="1.0000" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} />
              </div>
            )}
            {type === "dividende" && (
              <div className="space-y-2">
                <Label htmlFor="tax">Impôt ({transactionCurrencySymbol})</Label>
                <Input id="tax" type="number" step="0.01" placeholder="0.00" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
            )}
          </div>

          {/* ── FRAIS ── */}
          {type !== "dividende" && (
            <>
              <SectionTitle>Frais</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fees">Frais ({transactionCurrencySymbol})</Label>
                  <Input id="fees" type="number" step="0.01" placeholder="0.00" value={fees} onChange={(e) => setFees(e.target.value)} />
                  {detail && (
                    <p className="text-xs text-muted-foreground">
                      {detail.total} × {detail.percent}% = {detail.fromPercent}{currencySymbol}
                      {detail.isMin && <span className="ml-1 text-amber-600">(min. {detail.min}{currencySymbol})</span>}
                    </p>
                  )}
                </div>

                {showTFF && type === "achat" && currency === "EUR" && (
                  <div className="space-y-2">
                    <Label>TFF automatique</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={autoTFF ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setAutoTFF(true);
                          if (quantity && unitPrice) setTff(calculateTFF().toFixed(2));
                        }}
                      >
                        OUI
                      </Button>
                      <Button
                        type="button"
                        variant={!autoTFF ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => { setAutoTFF(false); setTff(""); }}
                      >
                        NON
                      </Button>
                    </div>
                    {autoTFF && (
                      <Input id="tff" type="number" step="0.01" placeholder="0.00" value={tff} onChange={(e) => setTff(e.target.value)} disabled={autoTFF} />
                    )}
                    {autoTFF && effectivePortfolio?.fees.defaultTFF && (
                      <p className="text-xs text-muted-foreground">Taux : {effectivePortfolio.fees.defaultTFF}%</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── RÉCAPITULATIF ── */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {type === "dividende" ? "Dividende brut" : "Montant total"}
              </p>
              <p className="text-2xl font-bold text-primary">
                {totalAmount().toFixed(2)} {transactionCurrencySymbol}
              </p>
              {currency !== effectivePortfolio?.currency && conversionRate && (
                <p className="text-xs text-muted-foreground">
                  = {(totalAmount() * (parseFloat(conversionRate) || 1)).toFixed(2)} {currencySymbol}
                </p>
              )}
              {type === "dividende" && (
                <p className="text-xs text-muted-foreground">
                  Net : {(totalAmount() - (parseFloat(tax) || 0)).toFixed(2)} {transactionCurrencySymbol}
                </p>
              )}
            </div>

            {type === "achat" && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PRU</p>
                <p className="text-2xl font-bold text-primary">
                  {quantity && unitPrice ? calculatePRU().toFixed(4) : "—"} {currencySymbol}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit">Ajouter le mouvement</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
