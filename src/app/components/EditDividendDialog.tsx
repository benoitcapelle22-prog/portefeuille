import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "../supabase";

export type DividendRow = {
  id: string;
  date: string;
  code: string;
  name: string;
  type: "dividende";
  quantity: number;
  unitPrice: number; // dividende / action
  currency: string;
  conversionRate: number;
  tax?: number | null;
  portfolioCode?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dividend: DividendRow | null;
  onSaved: (updated: DividendRow) => void;
};

export function EditDividendDialog({ open, onOpenChange, dividend, onSaved }: Props) {
  const initial = useMemo(() => dividend, [dividend]);
  const [form, setForm] = useState<DividendRow | null>(dividend);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(dividend);
    setError(null);
  }, [dividend]);

  if (!form) return null;

  const set = <K extends keyof DividendRow>(k: K, v: DividendRow[K]) => {
    setForm(prev => (prev ? { ...prev, [k]: v } : prev));
  };

  const gross = (Number(form.unitPrice) || 0) * (Number(form.quantity) || 0);
  const grossConverted = gross * (Number(form.conversionRate) || 1);
  const taxConverted = (Number(form.tax) || 0) * (Number(form.conversionRate) || 1);
  const netConverted = grossConverted - taxConverted;

  const changed = JSON.stringify(form) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch = {
        date: form.date,
        code: form.code.trim().toUpperCase(),
        name: form.name,
        type: "dividende",
        quantity: Number(form.quantity) || 0,
        unitPrice: Number(form.unitPrice) || 0,
        currency: form.currency,
        conversionRate: Number(form.conversionRate) || 1,
        tax: form.tax ?? 0,
      };

      const { data, error } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", form.id)
        .select("*")
        .single();

      if (error) throw error;

      onSaved(data as DividendRow);
      onOpenChange(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le dividende</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Code</Label>
            <Input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Nom</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Dividende / action</Label>
            <Input
              type="number"
              step="0.0001"
              value={form.unitPrice}
              onChange={e => set("unitPrice", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label>Quantité</Label>
            <Input
              type="number"
              step="0.01"
              value={form.quantity}
              onChange={e => set("quantity", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label>Devise</Label>
            <Input value={form.currency} onChange={e => set("currency", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Taux conversion</Label>
            <Input
              type="number"
              step="0.0001"
              value={form.conversionRate}
              onChange={e => set("conversionRate", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Impôt (dans la devise du dividende)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.tax ?? 0}
              onChange={e => set("tax", Number(e.target.value))}
            />
          </div>

          <div className="md:col-span-2 rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Brut (devise)</span>
              <span className="font-medium">{gross.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span>Brut (converti)</span>
              <span className="font-medium">{grossConverted.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Impôt (converti)</span>
              <span className="font-medium">{taxConverted.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Net (converti)</span>
              <span className="font-medium">{netConverted.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving || !changed}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}