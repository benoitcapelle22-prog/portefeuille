import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Loader2 } from "lucide-react";
import { SECTORS } from "./CurrentPositions";
import { SECTOR_MAP } from "./TransactionDialog";

export interface LTPlanEntry {
  id?: string;
  date: string;
  code: string;
  name: string;
  sector?: string | null;
  buyZone1: number | null;
  buyZone2: number | null;
  buyZone3: number | null;
  closePrice: number | null;
}

interface LTPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editPlan?: LTPlanEntry;
  onSaved?: (entry: LTPlanEntry) => void;
}

export function LTPlanDialog({ open, onOpenChange, editPlan, onSaved }: LTPlanDialogProps) {
  const isEditMode = !!editPlan;
  const todayStr = new Date().toISOString().split("T")[0];

  const [date, setDate] = useState(todayStr);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [buyZone1, setBuyZone1] = useState("");
  const [buyZone2, setBuyZone2] = useState("");
  const [buyZone3, setBuyZone3] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTouchedRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (isEditMode && editPlan) {
        setDate(editPlan.date);
        setCode(editPlan.code);
        setName(editPlan.name);
        setSector(editPlan.sector ?? "");
        setBuyZone1(editPlan.buyZone1 != null ? String(editPlan.buyZone1) : "");
        setBuyZone2(editPlan.buyZone2 != null ? String(editPlan.buyZone2) : "");
        setBuyZone3(editPlan.buyZone3 != null ? String(editPlan.buyZone3) : "");
      } else {
        setDate(todayStr);
        setCode("");
        setName("");
        setSector("");
        setBuyZone1("");
        setBuyZone2("");
        setBuyZone3("");
        nameTouchedRef.current = false;
      }
    }
  }, [open]);

  // ── Auto-fetch nom + secteur depuis le code (création uniquement) ──
  useEffect(() => {
    if (isEditMode) return;
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

  const handleSave = () => {
    const entry: LTPlanEntry = {
      ...(isEditMode && editPlan ? editPlan : {}),
      date,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      sector: sector || null,
      buyZone1: buyZone1.trim() ? parseFloat(buyZone1) : null,
      buyZone2: buyZone2.trim() ? parseFloat(buyZone2) : null,
      buyZone3: buyZone3.trim() ? parseFloat(buyZone3) : null,
      closePrice: isEditMode && editPlan ? editPlan.closePrice : null,
    };
    onSaved?.(entry);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Modifier le plan" : "Plan long terme"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Secteur</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Code action</Label>
            <div className="relative">
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="h-9 font-mono" />
              {fetchLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nom</Label>
            <Input value={name} onChange={e => { setName(e.target.value); nameTouchedRef.current = true; }} className="h-9" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Zone achat 1</Label>
            <Input type="number" step="0.0001" placeholder="—" value={buyZone1} onChange={e => setBuyZone1(e.target.value)} className="h-9 text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zone achat 2</Label>
            <Input type="number" step="0.0001" placeholder="—" value={buyZone2} onChange={e => setBuyZone2(e.target.value)} className="h-9 text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zone achat 3</Label>
            <Input type="number" step="0.0001" placeholder="—" value={buyZone3} onChange={e => setBuyZone3(e.target.value)} className="h-9 text-right" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={!code.trim() || !name.trim()}>
            {isEditMode ? "Enregistrer" : "Ajouter au plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
