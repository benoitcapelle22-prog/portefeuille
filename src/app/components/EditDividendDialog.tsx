import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "../supabase";
import { Transaction } from "./TransactionForm";
import { Portfolio } from "./PortfolioSelector";

export type DividendRow = {
  id: string;
  date: string;
  code: string;
  name: string;
  type: "dividende";
  quantity: number;
  unitPrice: number;
  currency: string;
  conversionRate: number;
  tax?: number | null;
  portfolioCode?: string;
};

type BlankDividend = Omit<DividendRow, "id">;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dividend: DividendRow | null;
  onSaved?: (updated: DividendRow) => void;
  onCreate?: (div: Omit<Transaction, "id">, portfolioId?: string) => void;
  portfolios?: Portfolio[];
  currentPortfolioId?: string;
  initialCode?: string;
  initialName?: string;
  portfolioCurrency?: string;
};

function evalMathExpr(expr: string): number {
  if (!expr.trim()) return 0;
  const safe = expr.replace(/[^0-9+\-*/.() ]/g, '');
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + safe + ')')();
    if (typeof result === 'number' && isFinite(result)) return result;
  } catch {}
  return parseFloat(expr) || 0;
}

function getCurrencySymbol(curr: string) {
  switch (curr) {
    case "EUR": return "€";  case "USD": return "$";  case "GBP": return "£";
    case "GBX": return "p";  case "JPY": return "¥";  case "CAD": return "CA$";
    case "CHF": return "CHF"; case "DKK": case "SEK": return "kr";
    default: return curr;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

const BLANK: BlankDividend = {
  date: new Date().toISOString().split("T")[0],
  code: "", name: "", type: "dividende",
  quantity: 0, unitPrice: 0,
  currency: "EUR", conversionRate: 1, tax: 0,
};

export function EditDividendDialog({ open, onOpenChange, dividend, onSaved, onCreate, portfolios, currentPortfolioId, initialCode, initialName, portfolioCurrency = "EUR" }: Props) {
  const isCreateMode = dividend === null && !!onCreate;
  const initial = useMemo(() => dividend, [dividend]);
  const [form, setForm] = useState<BlankDividend | DividendRow>(dividend ?? { ...BLANK });
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | undefined>(currentPortfolioId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxInput, setTaxInput] = useState(String(dividend?.tax ?? 0));

  useEffect(() => {
    if (open) {
      const d = dividend ?? { ...BLANK, code: initialCode ?? "", name: initialName ?? "" };
      setForm(d);
      setTaxInput(String((d as any).tax ?? 0));
      setSelectedPortfolioId(currentPortfolioId);
      setError(null);
    }
  }, [open, dividend, initialCode, initialName, currentPortfolioId]);

  const set = <K extends keyof BlankDividend>(k: K, v: BlankDividend[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  const isForeignCurrency = form.currency !== portfolioCurrency;
  const portSymbol   = getCurrencySymbol(portfolioCurrency);
  const actionSymbol = getCurrencySymbol(form.currency);

  const qty       = Number(form.quantity)      || 0;
  const div       = Number(form.unitPrice)     || 0;
  const convRate  = Number(form.conversionRate) || 1;
  const taxVal    = evalMathExpr(taxInput);

  const grossInCurrency = qty * div;
  const grossConverted  = isForeignCurrency ? grossInCurrency * convRate : grossInCurrency;
  const net             = grossConverted - taxVal;
  const hasValues       = qty > 0 && div > 0;

  const changed = isCreateMode || JSON.stringify(form) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isCreateMode) {
        onCreate!({
          date: form.date,
          code: form.code.trim().toUpperCase(),
          name: form.name,
          type: "dividende",
          quantity: qty,
          unitPrice: div,
          fees: 0, tff: 0,
          currency: form.currency,
          conversionRate: isForeignCurrency ? convRate : 1,
          tax: taxVal,
        }, selectedPortfolioId);
        onOpenChange(false);
      } else {
        const patch = {
          date: form.date,
          code: form.code.trim().toUpperCase(),
          name: form.name,
          type: "dividende",
          quantity: qty,
          unit_price: div,
          currency: form.currency,
          conversion_rate: isForeignCurrency ? convRate : 1,
          tax: taxVal,
        };

        const { data, error } = await supabase
          .from("transactions")
          .update(patch)
          .eq("id", (form as DividendRow).id)
          .select("*")
          .single();

        if (error) throw error;
        const mapped: DividendRow = {
          id: data.id,
          date: data.date,
          code: data.code,
          name: data.name,
          type: "dividende",
          quantity: data.quantity,
          unitPrice: data.unit_price,
          currency: data.currency,
          conversionRate: data.conversion_rate,
          tax: data.tax,
          portfolioCode: data.portfolio_code,
        };
        onSaved?.(mapped);
        onOpenChange(false);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <DialogTitle>{isCreateMode ? "Nouveau dividende" : "Modifier le dividende"}</DialogTitle>
          {isCreateMode && portfolios && portfolios.length > 1 && (
            <Select value={selectedPortfolioId ?? ""} onValueChange={setSelectedPortfolioId}>
              <SelectTrigger className="h-8 text-sm w-56"><SelectValue placeholder="Sélectionner un portefeuille" /></SelectTrigger>
              <SelectContent>
                {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </DialogHeader>

        <div className="space-y-3">

          <SectionTitle>Identification</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input type="text" placeholder="Ex: MC.PA" value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Nom de l'action</Label>
              <Input type="text" value={form.name} onChange={e => set("name", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <SectionTitle>Transaction</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre d'actions</Label>
              <Input type="number" step="0.01" placeholder="0" value={form.quantity} onChange={e => set("quantity", Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Div./action ({actionSymbol})</Label>
              <Input type="number" step="0.0001" placeholder="0.0000" value={form.unitPrice} onChange={e => set("unitPrice", Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Devise</Label>
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
              <Label className="text-xs">Impôt ({portSymbol})</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={taxInput}
                onChange={e => setTaxInput(e.target.value)}
                onBlur={() => {
                  const v = evalMathExpr(taxInput);
                  setTaxInput(v === 0 && taxInput.trim() === "" ? "" : String(Math.round(v * 100) / 100));
                  set("tax", v);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = evalMathExpr(taxInput);
                    setTaxInput(v === 0 && taxInput.trim() === "" ? "" : String(Math.round(v * 100) / 100));
                    set("tax", v);
                  }
                }}
                className="h-8 text-sm"
              />
            </div>
            {isForeignCurrency && (
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Taux de change — 1 {form.currency} = ? {portfolioCurrency}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="1.0000"
                  value={form.conversionRate}
                  onChange={e => set("conversionRate", Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>

          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dividende brut</p>
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

          {error && <div className="text-sm text-red-500">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !changed}>
              {saving ? "Enregistrement..." : isCreateMode ? "Ajouter le dividende" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
