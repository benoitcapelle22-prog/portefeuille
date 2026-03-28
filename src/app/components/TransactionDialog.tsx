import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { Loader2 } from "lucide-react";
import { useExchangeRates } from "../hooks/useExchangeRates";

const SECTORS = [
  "Finance", "Technology", "Santé", "Énergie", "Industrie",
  "Consommation", "Immobilier", "Matériaux", "Services publics", "Télécommunications", "Autre",
];

const SECTOR_MAP: Record<string, string> = {
  "Technology": "Technology", "Information Technology": "Technology",
  "Financial Services": "Finance", "Finance": "Finance", "Banking": "Finance", "Insurance": "Finance",
  "Healthcare": "Santé", "Health Care": "Santé", "Biotechnology": "Santé", "Pharmaceuticals": "Santé",
  "Energy": "Énergie", "Oil & Gas": "Énergie",
  "Industrials": "Industrie", "Industrial": "Industrie", "Aerospace & Defense": "Industrie", "Manufacturing": "Industrie",
  "Consumer Cyclical": "Consommation", "Consumer Defensive": "Consommation", "Consumer Staples": "Consommation",
  "Consumer Discretionary": "Consommation", "Retail": "Consommation",
  "Real Estate": "Immobilier",
  "Basic Materials": "Matériaux", "Materials": "Matériaux", "Chemicals": "Matériaux", "Mining": "Matériaux",
  "Utilities": "Services publics",
  "Communication Services": "Télécommunications", "Telecommunications": "Télécommunications",
  "Telecom": "Télécommunications", "Media": "Télécommunications",
};

type Currency = "EUR" | "USD" | "GBP" | "GBX" | "CHF" | "JPY" | "CAD" | "DKK" | "SEK";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTransaction?: (transaction: Omit<Transaction, "id">, portfolioId?: string) => void;
  onEditTransaction?: (updated: Transaction & { portfolioId?: string }) => Promise<void>;
  currentPortfolio?: Portfolio;
  portfolios?: Portfolio[];
  initialData?: {
    // Champs création
    code?: string;
    name?: string;
    type?: "achat" | "vente" | "dividende";
    quantity?: number;
    portfolioId?: string;
    // Champs édition (editId = mode édition)
    editId?: string;
    date?: string;
    unitPrice?: number;
    currency?: string;
    conversionRate?: number; // convention stockée : 1 devise = ? EUR (= 1/taux affiché)
    fees?: number;
    tff?: number;
    sector?: string;
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

export function TransactionDialog({
  open, onOpenChange, onAddTransaction, currentPortfolio, portfolios, initialData,
}: TransactionDialogProps) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"achat" | "vente">("achat");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [conversionRate, setConversionRate] = useState("1");
  const [fees, setFees] = useState("");
  const [tff, setTff] = useState("");
  const [sector, setSector] = useState("");
  const [autoTFF, setAutoTFF] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | undefined>(
    currentPortfolio?.id ?? initialData?.portfolioId
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTouchedRef = useRef(false);
  const rateTouchedRef = useRef(false);

  const { getConversionRate } = useExchangeRates();

  const effectivePortfolio =
    (selectedPortfolioId && portfolios
      ? portfolios.find(p => p.id === selectedPortfolioId)
      : undefined) ??
    currentPortfolio;

  const isEditMode = !!initialData?.editId;
  const portfolioCurrency = (effectivePortfolio?.currency as Currency) || "EUR";
  const isForeignCurrency = currency !== portfolioCurrency;
  const showTFF = type === "achat" && portfolioCurrency === "EUR" && currency === "EUR";

  // ── Reset à la fermeture ───────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setDate(new Date().toISOString().split("T")[0]);
      setCode(""); setName(""); setType("achat"); setQuantity(""); setUnitPrice("");
      setCurrency(portfolioCurrency); setConversionRate("1");
      setFees(""); setTff(""); setSector(""); setAutoTFF(false);
      setSelectedPortfolioId(currentPortfolio?.id ?? initialData?.portfolioId);
      nameTouchedRef.current = false;
      rateTouchedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  // ── Pré-remplissage depuis initialData ────────────────────────
  useEffect(() => {
    if (open && initialData) {
      if (initialData.code)     setCode(initialData.code);
      if (initialData.name)     { setName(initialData.name); nameTouchedRef.current = true; }
      if (initialData.type && initialData.type !== "dividende") setType(initialData.type);
      if (initialData.quantity) setQuantity(String(initialData.quantity));

      if (initialData.editId) {
        // Mode édition : pré-remplir tous les champs
        if (initialData.date)      setDate(initialData.date);
        if (initialData.unitPrice != null) setUnitPrice(String(initialData.unitPrice));
        if (initialData.fees  != null) setFees(String(initialData.fees));
        if (initialData.tff   != null) {
          setTff(String(initialData.tff));
          if ((initialData.tff || 0) > 0) setAutoTFF(true);
        }
        if (initialData.sector)    setSector(initialData.sector);
        if (initialData.portfolioId) setSelectedPortfolioId(initialData.portfolioId);
        // Devise : pré-remplir avant le taux pour que isForeignCurrency soit correct
        const cur = (initialData.currency as Currency) || portfolioCurrency;
        setCurrency(cur);
        // Taux : convertir depuis la convention stockée (1/taux affiché) vers la convention affichée
        const storedRate = initialData.conversionRate ?? 1;
        const displayedRate = cur !== portfolioCurrency && storedRate > 0 ? 1 / storedRate : 1;
        setConversionRate(displayedRate.toFixed(4));
        rateTouchedRef.current = true; // empêcher l'écrasement auto
      }
    }
  }, [open, initialData]);

  // ── Devise par défaut portefeuille (mode création uniquement) ─
  useEffect(() => {
    if (open && !initialData?.editId) { setCurrency(portfolioCurrency); setConversionRate("1"); }
  }, [open, portfolioCurrency]);

  // ── Taux de change automatique quand devise change ───────────
  useEffect(() => {
    if (!isForeignCurrency) { setConversionRate("1"); rateTouchedRef.current = false; return; }
    if (rateTouchedRef.current) return; // ne pas écraser si l'utilisateur a saisi manuellement
    // getConversionRate retourne "1 EUR = ? devise"
    // Pour obtenir "1 devise_action = ? devise_portefeuille" :
    //   1 devise_action = (1 / rate_action) EUR = (1 / rate_action) * rate_portfolio devise_portefeuille
    const rateCurrency = getConversionRate(currency);          // 1 EUR = ? devise_action
    const ratePortfolio = getConversionRate(portfolioCurrency); // 1 EUR = ? devise_portefeuille
    if (ratePortfolio > 0) {
      const rate = rateCurrency / ratePortfolio;
      setConversionRate(rate.toFixed(4));
    }
  }, [currency, portfolioCurrency, isForeignCurrency, getConversionRate]);

  // ── Auto-fetch ticker + nom + secteur (mode création uniquement) ──
  useEffect(() => {
    if (isEditMode) return; // en édition, ne pas écraser les valeurs existantes
    const trimmed = code.trim().toUpperCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmed || trimmed.length < 2) { setFetchLoading(false); return; }
    setFetchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [tickerRes, searchRes] = await Promise.all([
          fetch(`/api/ticker?symbol=${encodeURIComponent(trimmed)}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/yahoo-search?q=${encodeURIComponent(trimmed)}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (tickerRes?.price != null) setUnitPrice(Number(tickerRes.price).toFixed(4));
        if (tickerRes?.currency) {
          const apiCur = tickerRes.currency.toUpperCase() as Currency;
          const known: Currency[] = ["EUR", "USD", "GBP", "GBX", "CHF", "JPY", "CAD", "DKK", "SEK"];
          if (known.includes(apiCur)) { setCurrency(apiCur); rateTouchedRef.current = false; }
        }
        const fetchedName = tickerRes?.name ?? searchRes?.name ?? null;
        if (fetchedName && !nameTouchedRef.current) setName(fetchedName);
        const fetchedSector = searchRes?.sector ?? null;
        if (fetchedSector && !sector) {
          const mapped = SECTOR_MAP[fetchedSector] ?? fetchedSector;
          setSector(SECTORS.includes(mapped) ? mapped : "");
        }
      } finally { setFetchLoading(false); }
    }, 900);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [code]);

  // ── Auto-calcul frais (mode création uniquement) ─────────────
  useEffect(() => {
    if (isEditMode) return;
    if (!quantity || !unitPrice || !effectivePortfolio?.fees.defaultFeesPercent) return;
    setFees(computeFees().toFixed(2));
  }, [quantity, unitPrice, currency, conversionRate, type, effectivePortfolio?.fees]);

  // ── Auto-calcul TFF ──────────────────────────────────────────
  useEffect(() => {
    if (!autoTFF || !showTFF) return;
    setTff(computeTFF().toFixed(2));
  }, [autoTFF, quantity, unitPrice, showTFF]);

  useEffect(() => { if (!showTFF) { setAutoTFF(false); setTff(""); } }, [showTFF]);

  // ── Calculs ──────────────────────────────────────────────────
  const qty      = parseFloat(quantity) || 0;
  const price    = parseFloat(unitPrice) || 0;
  const convRate = parseFloat(conversionRate) || 1;
  const feesVal  = parseFloat(fees) || 0;
  const tffVal   = autoTFF ? (parseFloat(tff) || 0) : 0;

  const montantBrutDevise    = qty * price;
  // convRate = "1 EUR = ? devise" → pour convertir devise → EUR on divise
  const montantBrutConverti  = convRate > 0 ? montantBrutDevise / convRate : montantBrutDevise;
  const montantTotal = type === "achat" ? montantBrutConverti + feesVal + tffVal : montantBrutConverti - feesVal;
  const pruOuNet = qty > 0 ? montantTotal / qty : 0;

  function computeFees() {
    if (!effectivePortfolio?.fees.defaultFeesPercent || !quantity || !unitPrice) return 0;
    const base = convRate > 0 ? qty * price / convRate : qty * price;
    const fromPct = base * effectivePortfolio.fees.defaultFeesPercent / 100;
    return Math.max(fromPct, effectivePortfolio.fees.defaultFeesMin || 0);
  }

  function computeTFF() {
    if (!effectivePortfolio?.fees.defaultTFF || !quantity || !unitPrice) return 0;
    return qty * price * effectivePortfolio.fees.defaultTFF / 100;
  }

  const feesDetail = () => {
    if (!effectivePortfolio?.fees.defaultFeesPercent || !quantity || !unitPrice) return null;
    const base = convRate > 0 ? qty * price / convRate : qty * price;
    const fromPct = base * effectivePortfolio.fees.defaultFeesPercent / 100;
    const min = effectivePortfolio.fees.defaultFeesMin || 0;
    return { base: base.toFixed(2), percent: effectivePortfolio.fees.defaultFeesPercent, fromPct: fromPct.toFixed(2), min, isMin: fromPct < min };
  };

  const detail = feesDetail();
  const portSymbol   = getCurrencySymbol(portfolioCurrency);
  const actionSymbol = getCurrencySymbol(currency);
  const hasValues    = qty > 0 && price > 0;

  // ── Soumission ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !quantity || !unitPrice) { alert("Veuillez remplir tous les champs obligatoires"); return; }
    // PortfolioLayout utilise unitPrice * conversionRate → on stocke l'inverse (1 devise = ? EUR)
    const storedConvRate = isForeignCurrency && convRate > 0 ? 1 / convRate : 1;
    const tffFinal = showTFF ? (parseFloat(tff) || 0) : 0;
    const txData = {
      date, code: code.toUpperCase(), name, type,
      quantity: qty, unitPrice: price,
      fees: feesVal,
      tff: tffFinal,
      currency, conversionRate: storedConvRate,
      tax: 0,
      sector: sector || undefined,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <DialogTitle>{isEditMode ? "Modifier le mouvement" : "Nouvelle transaction"}</DialogTitle>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            <div className="space-y-1">
              <Label htmlFor="date" className="text-xs">Date</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="code" className="text-xs flex items-center gap-1">
                Code {fetchLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="code" type="text" placeholder="Ex: MC.PA" value={code}
                onChange={e => setCode(e.target.value.toUpperCase())} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1 col-span-2">
              <Label htmlFor="name" className="text-xs">Nom</Label>
              <Input id="name" type="text" placeholder="Nom de l'action" value={name}
                onChange={e => { setName(e.target.value); nameTouchedRef.current = true; }} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1 col-span-2 sm:col-span-4">
              <Label htmlFor="sector" className="text-xs">Secteur</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger id="sector" className="h-8 text-sm"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* ── TRANSACTION ─────────────────────────────────────── */}
          <SectionTitle>Transaction</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            <div className="space-y-1">
              <Label htmlFor="type" className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v: "achat" | "vente") => setType(v)}>
                <SelectTrigger id="type" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="achat">Achat</SelectItem>
                  <SelectItem value="vente">Vente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="quantity" className="text-xs">Quantité</Label>
              <Input id="quantity" type="number" step="0.01" placeholder="0" value={quantity}
                onChange={e => setQuantity(e.target.value)} required className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="currency" className="text-xs">Devise</Label>
              <Select value={currency} onValueChange={(v: Currency) => { setCurrency(v); rateTouchedRef.current = false; }}>
                <SelectTrigger id="currency" className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
              <Label htmlFor="unitPrice" className="text-xs">Cours ({actionSymbol})</Label>
              <Input id="unitPrice" type="number" step="0.0001" placeholder="0.0000" value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)} required className="h-8 text-sm" />
            </div>

            {isForeignCurrency && (
              <div className="space-y-1 col-span-2 sm:col-span-4">
                <Label htmlFor="conversionRate" className="text-xs">
                  Taux de change — 1 {portfolioCurrency} = ? {currency}
                </Label>
                <Input id="conversionRate" type="number" step="0.0001" placeholder="1.0000" value={conversionRate}
                  onChange={e => { setConversionRate(e.target.value); rateTouchedRef.current = true; }}
                  className="h-8 text-sm" />
              </div>
            )}

          </div>

          {/* ── FRAIS ───────────────────────────────────────────── */}
          <SectionTitle>Frais</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            <div className="space-y-1">
              <Label htmlFor="fees" className="text-xs">Frais ({portSymbol})</Label>
              <Input id="fees" type="number" step="0.01" placeholder="0.00" value={fees}
                onChange={e => setFees(e.target.value)} className="h-8 text-sm" />
              {detail && (
                <p className="text-xs text-muted-foreground">
                  {detail.base} × {detail.percent}% = {detail.fromPct}{portSymbol}
                  {detail.isMin && <span className="ml-1 text-amber-600">(min. {detail.min}{portSymbol})</span>}
                </p>
              )}
            </div>

            {showTFF && (
              <div className="space-y-1">
                <Label className="text-xs">TFF automatique</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={autoTFF ? "default" : "outline"} size="sm" className="flex-1 h-8"
                    onClick={() => { setAutoTFF(true); if (quantity && unitPrice) setTff(computeTFF().toFixed(2)); }}>
                    OUI
                  </Button>
                  <Button type="button" variant={!autoTFF ? "default" : "outline"} size="sm" className="flex-1 h-8"
                    onClick={() => { setAutoTFF(false); setTff(""); }}>
                    NON
                  </Button>
                  <Input id="tff" type="number" step="0.01" value={tff} placeholder="0.00"
                    onChange={e => setTff(e.target.value)} className="h-8 text-sm w-24" />
                </div>
                <p className="text-xs text-muted-foreground" style={{ visibility: autoTFF && effectivePortfolio?.fees.defaultTFF ? "visible" : "hidden" }}>
                  Taux TFF : {effectivePortfolio?.fees.defaultTFF ?? 0}%
                </p>
              </div>
            )}

          </div>

          {/* ── RÉCAPITULATIF ───────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">

            {/* Gauche : détail montants */}
            <div className="space-y-1 text-sm">
              {isForeignCurrency && hasValues && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Brut ({currency})</span>
                    <span className="font-medium">{montantBrutDevise.toFixed(2)} {actionSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Brut converti</span>
                    <span className="font-medium">{montantBrutConverti.toFixed(2)} {portSymbol}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frais</span>
                <span className="font-medium">{feesVal.toFixed(2)} {portSymbol}</span>
              </div>
              {showTFF && autoTFF && tffVal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TFF +</span>
                  <span className="font-medium">{tffVal.toFixed(2)} {portSymbol}</span>
                </div>
              )}
            </div>

            {/* Droite : total + PRU */}
            <div className="space-y-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {type === "achat" ? "Total décaissé" : "Total encaissé"}
                </p>
                <p className="text-2xl font-bold text-primary">
                  {hasValues ? montantTotal.toFixed(2) : "—"} {portSymbol}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {type === "achat" ? "PRU" : "Net / action"}
                </p>
                <p className="text-xl font-bold text-primary">
                  {hasValues ? pruOuNet.toFixed(4) : "—"} {portSymbol}
                </p>
              </div>
            </div>

          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" size="sm">{isEditMode ? "Enregistrer" : "Ajouter le mouvement"}</Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
