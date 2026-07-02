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
  buyZone1Low: number | null;
  buyZone1High: number | null;
  buyZone1Target: number | null;
  buyZone2Low: number | null;
  buyZone2High: number | null;
  buyZone2Target: number | null;
  buyZone3Low: number | null;
  buyZone3High: number | null;
  buyZone3Target: number | null;
  closePrice: number | null;
}

interface LTPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editPlan?: LTPlanEntry;
  onSaved?: (entry: LTPlanEntry) => void;
}

function numStr(v: number | null | undefined) {
  return v != null ? String(v) : "";
}

function parseNum(s: string): number | null {
  const t = s.trim();
  return t ? parseFloat(t) : null;
}

export function LTPlanDialog({ open, onOpenChange, editPlan, onSaved }: LTPlanDialogProps) {
  const isEditMode = !!editPlan;
  const todayStr = new Date().toISOString().split("T")[0];

  const [date, setDate] = useState(todayStr);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");

  const [z1Low, setZ1Low] = useState("");
  const [z1High, setZ1High] = useState("");
  const [z1Target, setZ1Target] = useState("");
  const [z2Low, setZ2Low] = useState("");
  const [z2High, setZ2High] = useState("");
  const [z2Target, setZ2Target] = useState("");
  const [z3Low, setZ3Low] = useState("");
  const [z3High, setZ3High] = useState("");
  const [z3Target, setZ3Target] = useState("");

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
        setZ1Low(numStr(editPlan.buyZone1Low));
        setZ1High(numStr(editPlan.buyZone1High));
        setZ1Target(numStr(editPlan.buyZone1Target));
        setZ2Low(numStr(editPlan.buyZone2Low));
        setZ2High(numStr(editPlan.buyZone2High));
        setZ2Target(numStr(editPlan.buyZone2Target));
        setZ3Low(numStr(editPlan.buyZone3Low));
        setZ3High(numStr(editPlan.buyZone3High));
        setZ3Target(numStr(editPlan.buyZone3Target));
      } else {
        setDate(todayStr);
        setCode(""); setName(""); setSector("");
        setZ1Low(""); setZ1High(""); setZ1Target("");
        setZ2Low(""); setZ2High(""); setZ2Target("");
        setZ3Low(""); setZ3High(""); setZ3Target("");
        nameTouchedRef.current = false;
      }
    }
  }, [open]);

  // Auto-fetch nom + secteur depuis le code (création uniquement)
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
      buyZone1Low: parseNum(z1Low),
      buyZone1High: parseNum(z1High),
      buyZone1Target: parseNum(z1Target),
      buyZone2Low: parseNum(z2Low),
      buyZone2High: parseNum(z2High),
      buyZone2Target: parseNum(z2Target),
      buyZone3Low: parseNum(z3Low),
      buyZone3High: parseNum(z3High),
      buyZone3Target: parseNum(z3Target),
      closePrice: isEditMode && editPlan ? editPlan.closePrice : null,
    };
    onSaved?.(entry);
    onOpenChange(false);
  };

  const zoneInputs = (
    label: string,
    low: string, setLow: (v: string) => void,
    high: string, setHigh: (v: string) => void,
    target: string, setTarget: (v: string) => void,
  ) => (
    <div className="col-span-2 space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Borne basse</Label>
          <Input type="number" step="0.0001" placeholder="—" value={low} onChange={e => setLow(e.target.value)} className="h-9 text-right" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Borne haute</Label>
          <Input type="number" step="0.0001" placeholder="—" value={high} onChange={e => setHigh(e.target.value)} className="h-9 text-right" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cible</Label>
          <Input type="number" step="0.0001" placeholder="—" value={target} onChange={e => setTarget(e.target.value)} className="h-9 text-right text-sky-600 font-medium" />
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
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

          {zoneInputs("Zone achat 1", z1Low, setZ1Low, z1High, setZ1High, z1Target, setZ1Target)}
          {zoneInputs("Zone achat 2", z2Low, setZ2Low, z2High, setZ2High, z2Target, setZ2Target)}
          {zoneInputs("Zone achat 3", z3Low, setZ3Low, z3High, setZ3High, z3Target, setZ3Target)}
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
