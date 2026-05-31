import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export interface SwingPlanEntry {
  id?: string;
  date: string;
  validityDate: string;
  code: string;
  name: string;
  quantity: number;
  limitPrice: number;
  stopPrice: number;
  riskAmount: number;
  tp1: number | null;
  status: "actif" | "déclenché" | "expiré" | "annulé" | "gagné" | "perdant";
  notes?: string | null;
  salePrice?: number | null;
}

function nextBusinessDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

interface SwingPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialValues: {
    code: string;
    name: string;
    quantity: number;
    limitPrice: number;
    stopPrice: number;
    riskAmount: number;
  };
  onSaved?: (entry: SwingPlanEntry) => void;
}

export function SwingPlanDialog({ open, onOpenChange, initialValues, onSaved }: SwingPlanDialogProps) {
  const [code, setCode] = useState(initialValues.code);
  const [name, setName] = useState(initialValues.name);
  const [quantity, setQuantity] = useState(String(initialValues.quantity));
  const [limitPrice, setLimitPrice] = useState(initialValues.limitPrice.toFixed(4));
  const [stopPrice, setStopPrice] = useState(initialValues.stopPrice.toFixed(4));
  const [tp1, setTp1] = useState("");

  const computedRisk = (parseInt(quantity) || 0) * Math.max(0, (parseFloat(limitPrice) || 0) - (parseFloat(stopPrice) || 0));

  useEffect(() => {
    if (open) {
      setCode(initialValues.code);
      setName(initialValues.name);
      setQuantity(String(initialValues.quantity));
      setLimitPrice(initialValues.limitPrice.toFixed(4));
      setStopPrice(initialValues.stopPrice.toFixed(4));
      setTp1("");
    }
  }, [open]);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const validityStr = nextBusinessDay(today).toISOString().split("T")[0];
  const fmt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("fr-FR");

  const handleSave = () => {
    const entry: SwingPlanEntry = {
      date: todayStr,
      validityDate: validityStr,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      quantity: parseInt(quantity) || 0,
      limitPrice: parseFloat(limitPrice) || 0,
      stopPrice: parseFloat(stopPrice) || 0,
      riskAmount: computedRisk,
      tp1: tp1.trim() ? parseFloat(tp1) : null,
      status: "actif",
    };
    onSaved?.(entry);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de swing trading</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm">{fmt(todayStr)}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Validité</Label>
            <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm">{fmt(validityStr)}</div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Code action</Label>
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="h-9 font-mono" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Nom</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Quantité</Label>
            <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-9 text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prix limite (APD)</Label>
            <Input type="number" step="0.0001" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} className="h-9 text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stop</Label>
            <Input type="number" step="0.0001" value={stopPrice} onChange={e => setStopPrice(e.target.value)} className="h-9 text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Risque (€)</Label>
            <div className="h-9 flex items-center justify-end px-3 rounded-md border bg-muted font-medium text-sm">
              {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(computedRisk)} €
            </div>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">TP1</Label>
            <Input type="number" step="0.0001" placeholder="—" value={tp1} onChange={e => setTp1(e.target.value)} className="h-9 text-right" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={!code.trim() || !name.trim()}>Ajouter au plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
