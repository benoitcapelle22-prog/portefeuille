import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { useExchangeRates } from "../hooks/useExchangeRates";

type Currency = "EUR" | "USD" | "GBP" | "GBX" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";

export interface DividendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTransaction?: (transaction: Omit<Transaction, "id">, portfolioId?: string) => void;
  onEditTransaction?: (updated: Transaction & { portfolioId?: string }) => Promise<void>;
  currentPortfolio?: Portfolio;
  portfolios?: Portfolio[];
  initialData?: {
    // Création
    code?: string;
    name?: string;
    type?: "dividende";
    quantity?: number;
    portfolioId?: string;
    // Édition (editId = mode édition)
    editId?: string;
    date?: string;
    unitPrice?: number;    // div/action en devise de l'action
    conversionRate?: number; // convention : 1 devise = ? portefeuille (direct, pas d'inversion)
    tax?: number;
    currency?: string;
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function getCurrencySymbol(curr: string) {
  switch (curr) {
    case "EUR": return "€";  case "USD": return "$";  case "GBP": return "£";
    case "GBX": return "p";  case "JPY": return "¥";  case "CAD": return "CA$";
    case "CHF": return "CHF"; case "DKK": case "SEK": return "kr";
    default: return curr;
  }
}

export function DividendDialog({
  open, onOpenChange, onAddTransaction, onEditTransaction, currentPortfolio, portfolios, initialData,
}: DividendDialogProps) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [divPerShare, setDivPerShare] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [conversionRate, setConversionRate] = useState("1");
  const [tax, setTax] = useState("");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | undefined>(
    currentPortfolio?.id ?? initialData?.portfolioId
  );

  const rateTouchedRef = useRef(false);
  const { getConversionRate } = useExchangeRates();

  const isEditMode = !!initialData?.editId;

  const effectivePortfolio =
    (selectedPortfolioId && portfolios
      ? portfolios.find(p => p.id === selectedPortfolioId)
      : undefined) ??
    currentPortfolio;

  const portfolioCurrency = (effectivePortfolio?.currency as Currency) || "EUR";
  const isForeignCurrency = currency !== portfolioCurrency;
  const portSymbol    = getCurrencySymbol(portfolioCurrency);
  const actionSymbol  = getCurrencySymbol(currency);

  // ── Reset à la fermeture ──────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setDate(new Date().toISOString().split("T")[0]);
      setCode(""); setName(""); setQuantity(""); setDivPerShare("");
      setCurrency(portfolioCurrency); setConversionRate("1"); setTax("");
      setSelectedPortfolioId(currentPortfolio?.id ?? initialData?.portfolioId);
      rateTouchedRef.current = false;
    }
  }, [open]);

  // ── Pré-remplissage depuis initialData ───────────────────────
  useEffect(() => {
    if (open && initialData) {
      if (initialData.code)     setCode(initialData.code);
      if (initialData.name)     setName(initialData.name);
      if (initialData.quantity) setQuantity(String(initialData.quantity));
      if (initialData.portfolioId) setSelectedPortfolioId(initialData.portfolioId);

      if (initialData.editId) {
        // Mode édition : pré-remplir tous les champs
        if (initialData.date)              setDate(initialData.date);
        if (initialData.unitPrice != null) setDivPerShare(String(initialData.unitPrice));
        if (initialData.tax       != null) setTax(String(initialData.tax));
        const cur = (initialData.currency as Currency) || portfolioCurrency;
        setCurrency(cur);
        // Convention stockée = convention affichée (1 devise = ? portefeuille) → pas d'inversion
        const storedRate = initialData.conversionRate ?? 1;
        setConversionRate(storedRate > 0 ? storedRate.toFixed(4) : "1");
        rateTouchedRef.current = true;
      }
    }
  }, [open, initialData]);

  // ── Devise par défaut portefeuille (mode création uniquement) ─
  useEffect(() => {
    if (open && !initialData?.editId) {
      setCurrency(portfolioCurrency);
      setConversionRate("1");
      rateTouchedRef.current = false;
    }
  }, [open, portfolioCurrency]);

  // ── Taux de change automatique ───────────────────────────────
  useEffect(() => {
    if (!isForeignCurrency) { setConversionRate("1"); rateTouchedRef.current = false; return; }
    if (rateTouchedRef.current) return;
    // Convention affichée : 1 {currency} = ? {portfolioCurrency}
    // getConversionRate retourne "1 EUR = ? devise"
    const rateCurrency  = getConversionRate(currency);           // 1 EUR = ? currency
    const ratePortfolio = getConversionRate(portfolioCurrency);  // 1 EUR = ? portfolioCurrency
    if (rateCurrency > 0) {
      setConversionRate((ratePortfolio / rateCurrency).toFixed(4));
    }
  }, [currency, portfolioCurrency, isForeignCurrency, getConversionRate]);

  // ── Calculs ──────────────────────────────────────────────────
  const qty      = parseFloat(quantity)       || 0;
  const div      = parseFloat(divPerShare)    || 0;
  const convRate = parseFloat(conversionRate) || 1;
  const taxVal   = parseFloat(tax)            || 0;

  const grossInCurrency = qty * div;
  const grossConverted  = isForeignCurrency ? grossInCurrency * convRate : grossInCurrency;
  const net             = grossConverted - taxVal;
  const hasValues       = qty > 0 && div > 0;

  // ── Soumission ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !quantity || !divPerShare) {
      alert("Veuillez remplir tous les champs obligatoires");
      return;
    }
    const storedConvRate = isForeignCurrency ? convRate : 1;
    const txData = {
      date,
      code: code.toUpperCase(),
      name,
      type: "dividende" as const,
      quantity: qty,
      unitPrice: div,
      fees: 0,
      tff: 0,
      currency,
      conversionRate: storedConvRate,
      tax: taxVal,
    };

    if (isEditMode && initialData?.editId && onEditTransaction) {
      await onEditTransaction({ ...txData, id: initialData.editId, portfolioId: selectedPortfolioId });
    } else if (onAddTransaction) {
      onAddTransaction(txData, selectedPortfolioId);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <DialogTitle>
            {isEditMode ? "Modifier le dividende" : "Nouvelle transaction"}
          </DialogTitle>
          {portfolios && portfolios.length > 1 ? (
            <DialogDescription asChild>
              <div>
                <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
                  <SelectTrigger className="h-8 text-sm w-56">
                    <SelectValue placeholder="Sélectionner un portefeuille" />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolios.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogDescription>
          ) : effectivePortfolio ? (
            <DialogDescription>
              <span className="font-medium text-primary">{effectivePortfolio.name}</span>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* ── IDENTIFICATION ──────────────────────────────────── */}
          <SectionTitle>Identification</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="div-date" className="text-xs">Date</Label>
              <Input id="div-date" type="date" value={date}
                onChange={e => setDate(e.target.value)} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="div-code" className="text-xs">Code</Label>
              <Input id="div-code" type="text" placeholder="Ex: MC.PA" value={code}
                onChange={e => setCode(e.target.value.toUpperCase())} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1 col-span-2">
              <Label htmlFor="div-name" className="text-xs">Nom de l'action</Label>
              <Input id="div-name" type="text" placeholder="Nom de l'action" value={name}
                onChange={e => setName(e.target.value)} required className="h-8 text-sm" />
            </div>
          </div>

          {/* ── TRANSACTION ─────────────────────────────────────── */}
          <SectionTitle>Transaction</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="div-qty" className="text-xs">Nombre d'actions</Label>
              <Input id="div-qty" type="number" step="0.01" placeholder="0" value={quantity}
                onChange={e => setQuantity(e.target.value)} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="div-per-share" className="text-xs">
                Div./action ({actionSymbol})
              </Label>
              <Input id="div-per-share" type="number" step="0.0001" placeholder="0.0000" value={divPerShare}
                onChange={e => setDivPerShare(e.target.value)} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="div-currency" className="text-xs">Devise</Label>
              <Select value={currency} onValueChange={(v: Currency) => { setCurrency(v); rateTouchedRef.current = false; }}>
                <SelectTrigger id="div-currency" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR €</SelectItem>
                  <SelectItem value="USD">USD $</SelectItem>
                  <SelectItem value="GBP">GBP £</SelectItem>
                  <SelectItem value="GBX">GBX p (pence)</SelectItem>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="JPY">JPY ¥</SelectItem>
                  <SelectItem value="CAD">CAD $</SelectItem>
                  <SelectItem value="DKK">DKK kr</SelectItem>
                  <SelectItem value="SEK">SEK kr</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="div-tax" className="text-xs">Impôt ({portSymbol})</Label>
              <Input id="div-tax" type="number" step="0.01" placeholder="0.00" value={tax}
                onChange={e => setTax(e.target.value)} className="h-8 text-sm" />
            </div>

            {isForeignCurrency && (
              <div className="space-y-1 col-span-2">
                <Label htmlFor="div-rate" className="text-xs">
                  Taux de change — 1 {currency} = ? {portfolioCurrency}
                </Label>
                <Input id="div-rate" type="number" step="0.0001" placeholder="1.0000" value={conversionRate}
                  onChange={e => { setConversionRate(e.target.value); rateTouchedRef.current = true; }}
                  className="h-8 text-sm" />
              </div>
            )}
          </div>

          {/* ── RÉCAPITULATIF ───────────────────────────────────── */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dividende brut
            </p>
            <p className="text-2xl font-bold text-primary">
              {hasValues ? grossConverted.toFixed(2) : "—"} {portSymbol}
            </p>
            {isForeignCurrency && hasValues && (
              <p className="text-xs text-muted-foreground">
                {grossInCurrency.toFixed(2)} {actionSymbol} × {convRate.toFixed(4)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Net : {hasValues ? net.toFixed(2) : "—"} {portSymbol}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm">
              {isEditMode ? "Enregistrer" : "Ajouter le mouvement"}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
