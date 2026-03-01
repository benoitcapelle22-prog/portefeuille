import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { supabase } from "../supabase";

export type TxType = "achat" | "vente" | "dividende" | "depot" | "retrait";

export type TransactionRow = {
  id: string;
  date: string;
  code: string;
  name: string;
  type: TxType;
  quantity: number;
  unitPrice: number;
  fees: number;
  tff: number;
  currency: string;
  conversionRate: number;
  tax?: number | null;
  sector?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  transaction: TransactionRow | null;

  // callback pour mettre à jour la ligne dans l’UI
  onSaved: (updated: TransactionRow) => void;
};

export function EditTransactionDialog({ open, onOpenChange, transaction, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(() => transaction, [transaction]);
  const [form, setForm] = useState<TransactionRow | null>(transaction);

  useEffect(() => {
    setForm(transaction);
    setError(null);
  }, [transaction]);

  if (!form) return null;

  const set = <K extends keyof TransactionRow>(k: K, v: TransactionRow[K]) => {
    setForm(prev => (prev ? { ...prev, [k]: v } : prev));
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);

    try {
      const patch: Partial<TransactionRow> = {
        date: form.date,
        code: form.code?.toUpperCase(),
        name: form.name,
        type: form.type,
        quantity: Number(form.quantity) || 0,
        unitPrice: Number(form.unitPrice) || 0,
        fees: Number(form.fees) || 0,
        tff: Number(form.tff) || 0,
        currency: form.currency,
        conversionRate: Number(form.conversionRate) || 1,
        tax: form.type === "dividende" ? (form.tax ?? null) : null,
        sector: form.sector ?? null,
      };

      const { data, error } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", form.id)
        .select("*")
        .single();

      if (error) throw error;

      onSaved(data as TransactionRow);
      onOpenChange(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const changed = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier le mouvement</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v: any) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="achat">Achat</SelectItem>
                <SelectItem value="vente">Vente</SelectItem>
                <SelectItem value="dividende">Dividende</SelectItem>
                <SelectItem value="depot">Dépôt</SelectItem>
                <SelectItem value="retrait">Retrait</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Code</Label>
            <Input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} />
          </div>

          <div className="space-y-1">
            <Label>Nom</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} />
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
            <Label>Cours</Label>
            <Input
              type="number"
              step="0.01"
              value={form.unitPrice}
              onChange={e => set("unitPrice", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label>Frais</Label>
            <Input
              type="number"
              step="0.01"
              value={form.fees}
              onChange={e => set("fees", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label>TFF</Label>
            <Input
              type="number"
              step="0.01"
              value={form.tff}
              onChange={e => set("tff", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label>Devise</Label>
            <Input value={form.currency} onChange={e => set("currency", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Taux de conversion</Label>
            <Input
              type="number"
              step="0.0001"
              value={form.conversionRate}
              onChange={e => set("conversionRate", Number(e.target.value))}
            />
          </div>

          {form.type === "dividende" && (
            <div className="space-y-1 md:col-span-2">
              <Label>Impôt</Label>
              <Input
                type="number"
                step="0.01"
                value={form.tax ?? 0}
                onChange={e => set("tax", Number(e.target.value))}
              />
            </div>
          )}

          <div className="space-y-1 md:col-span-2">
            <Label>Secteur</Label>
            <Input value={form.sector ?? ""} onChange={e => set("sector", e.target.value)} />
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