import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calculator, Loader2, PlusCircle } from "lucide-react";
import { SwingPlanDialog } from "./SwingPlanDialog";
import { addSwingPlan, getSetting, setSetting } from "../db";

type ProfileKey = "faible" | "moyen" | "normal" | "agressif";

const PROFILES: { key: ProfileKey; label: string; fullLabel: string; mult: number; headerCls: string }[] = [
  { key: "faible",   label: "R1", fullLabel: "FAIBLE",   mult: 0.50, headerCls: "bg-blue-500 hover:bg-blue-600" },
  { key: "moyen",    label: "R2", fullLabel: "MOYEN",    mult: 0.75, headerCls: "bg-green-500 hover:bg-green-600" },
  { key: "normal",   label: "R3", fullLabel: "NORMAL",   mult: 1.00, headerCls: "bg-pink-500 hover:bg-pink-600" },
  { key: "agressif", label: "R4", fullLabel: "AGRESSIF", mult: 2.00, headerCls: "bg-yellow-400 hover:bg-yellow-500" },
];

export function PositionSizeCalculator() {
  const [capital, setCapital] = useState(() => localStorage.getItem("psc_capital") ?? "16000.00");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("7.3");
  const [stopLoss, setStopLoss] = useState("6.76");
  const [baseRiskInput, setBaseRiskInput] = useState(() => localStorage.getItem("psc_baseRisk") ?? "0.50");
  const [maxLinePercent, setMaxLinePercent] = useState(() => localStorage.getItem("psc_maxLine") ?? "5");
  const [riskProfile, setRiskProfile] = useState<ProfileKey>("normal");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [swingDialogOpen, setSwingDialogOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTouchedRef = useRef(false);
  const saveCapitalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRiskRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const localCap = localStorage.getItem("psc_capital") ?? "16000.00";
    const localRisk = localStorage.getItem("psc_baseRisk") ?? "0.50";
    const localMaxLine = localStorage.getItem("psc_maxLine") ?? "5";
    Promise.all([getSetting("calc_capital"), getSetting("calc_baseRisk"), getSetting("calc_maxLine")]).then(([cap, risk, maxLine]) => {
      if (cap) { setCapital(cap); localStorage.setItem("psc_capital", cap); }
      else { setSetting("calc_capital", localCap).catch(console.error); }
      if (risk) { setBaseRiskInput(risk); localStorage.setItem("psc_baseRisk", risk); }
      else { setSetting("calc_baseRisk", localRisk).catch(console.error); }
      if (maxLine) { setMaxLinePercent(maxLine); localStorage.setItem("psc_maxLine", maxLine); }
      else { setSetting("calc_maxLine", localMaxLine).catch(console.error); }
    }).catch(console.error);
  }, []);

  const saveCapital = (value: string) => {
    if (saveCapitalRef.current) clearTimeout(saveCapitalRef.current);
    saveCapitalRef.current = setTimeout(() => { setSetting("calc_capital", value).catch(console.error); }, 1000);
  };
  const saveBaseRisk = (value: string) => {
    if (saveRiskRef.current) clearTimeout(saveRiskRef.current);
    saveRiskRef.current = setTimeout(() => { setSetting("calc_baseRisk", value).catch(console.error); }, 1000);
  };
  const saveMaxLine = (value: string) => {
    localStorage.setItem("psc_maxLine", value);
    setSetting("calc_maxLine", value).catch(console.error);
  };

  useEffect(() => {
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
        if (tickerRes?.price != null) setBuyPrice(Number(tickerRes.price).toFixed(4));
        const fetchedName = tickerRes?.name ?? searchRes?.name ?? null;
        if (fetchedName && !nameTouchedRef.current) setName(fetchedName);
      } finally { setFetchLoading(false); }
    }, 900);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [code]);

  // Derived numeric values
  const cap = parseFloat(capital) || 0;
  const buy = parseFloat(buyPrice) || 0;
  const stop = parseFloat(stopLoss) || 0;
  const baseRiskValue = parseFloat(baseRiskInput) || 0;
  const riskPerAction = Math.abs(buy - stop);
  const stopPercent = buy > 0 ? ((stop - buy) / buy) * 100 : 0;
  const maxLineAmount = cap * (parseFloat(maxLinePercent) || 0) / 100;

  const profileConfig = PROFILES.find(p => p.key === riskProfile) ?? PROFILES[2];
  const finalRisk = baseRiskValue * profileConfig.mult;
  const riskAmount = (cap * finalRisk) / 100;
  const maxShares = riskPerAction > 0 ? Math.floor(riskAmount / riskPerAction) : 0;
  const sharesFromLineSize = maxLineAmount > 0 && buy > 0 ? Math.floor(maxLineAmount / buy) : maxShares;
  const effectiveShares = Math.min(maxShares, sharesFromLineSize);
  const effectiveInvested = effectiveShares * buy;
  const effectivePct = cap > 0 ? (effectiveInvested / cap) * 100 : 0;
  const effectiveHalf = Math.floor(effectiveShares / 2);
  const effectiveHalfPct = cap > 0 ? (effectiveHalf * buy / cap) * 100 : 0;
  const effectiveHalfRisk = effectiveHalf * riskPerAction;
  const isLineSizeConstrained = effectiveShares < maxShares;

  const triggerRange = 0.35;
  const upperBound = buy * (1 + triggerRange / 100);
  const lowerBound = buy * (1 - triggerRange / 100);

  // Per-profile table data — pas de contrainte ligne max ici (uniquement dans la calculette)
  const tableData = PROFILES.map(profile => {
    const riskPct = baseRiskValue * profile.mult;
    const riskEur = cap * riskPct / 100;
    const nbTitres = riskPerAction > 0 ? Math.floor(riskEur / riskPerAction) : 0;
    const poidsLigne = cap > 0 ? (nbTitres * buy / cap) * 100 : 0;
    return { key: profile.key, riskPct, riskEur, nbTitres, poidsLigne };
  });

  const fmt = (v: number, d = 2) =>
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + " €";
  const fmtN = (v: number, d = 2) =>
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

  const tdBase = "px-3 py-2 text-center text-sm border border-gray-200 dark:border-gray-700";
  const tdLabel = "px-3 py-2 text-xs font-semibold text-left border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 whitespace-nowrap";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Calculette ─────────────────────────────────────────── */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-b-2">
          <div className="flex items-center gap-3">
            <Calculator className="h-6 w-6 text-primary" />
            <CardTitle className="text-lg font-bold uppercase tracking-wide">Action</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-4">
            {/* Code + Nom */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1">
                  Code action {fetchLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </Label>
                <Input
                  type="text"
                  placeholder="Ex: MC.PA"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); nameTouchedRef.current = false; }}
                  className="h-10 font-mono border-2"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Nom</Label>
                <Input
                  type="text"
                  placeholder="Nom de l'action"
                  value={name}
                  onChange={e => { setName(e.target.value); nameTouchedRef.current = true; }}
                  className="h-10 border-2"
                />
              </div>
            </div>

            {/* Prix achat + Stop */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Prix d'achat</Label>
                <Input
                  type="number" step="0.01" value={buyPrice}
                  onChange={e => setBuyPrice(e.target.value)}
                  className="h-12 text-right font-bold text-lg border-2"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">STOP</Label>
                <Input
                  type="number" step="0.01" value={stopLoss}
                  onChange={e => setStopLoss(e.target.value)}
                  className="h-12 text-right font-bold text-lg border-2"
                />
              </div>
              <Badge variant={stopPercent < 0 ? "destructive" : "default"} className="h-12 px-3 text-sm flex items-center">
                {stopPercent.toFixed(2)}%
              </Badge>
            </div>

            {/* Résultats profil sélectionné */}
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border-2 ${
              isLineSizeConstrained
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                : "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800"
            }`}>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  Actions à acheter
                  {isLineSizeConstrained && (
                    <span className="text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded-full font-medium">ligne max</span>
                  )}
                </div>
                <div className={`text-3xl font-bold ${isLineSizeConstrained ? "text-amber-600 dark:text-amber-400" : "text-teal-600 dark:text-teal-400"}`}>
                  {effectiveShares}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{fmtN(riskPerAction)} € / action</div>
              </div>
              <div className={`text-center border-l-2 border-r-2 ${isLineSizeConstrained ? "border-amber-200 dark:border-amber-800" : "border-teal-200 dark:border-teal-800"}`}>
                <div className="text-sm text-muted-foreground mb-1">Montant investi</div>
                <div className={`text-2xl font-bold ${isLineSizeConstrained ? "text-amber-700 dark:text-amber-300" : "text-teal-700 dark:text-teal-300"}`}>
                  {fmt(effectiveInvested, 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{effectivePct.toFixed(2)}% du PTF</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">½ position</div>
                <div className={`text-3xl font-bold ${isLineSizeConstrained ? "text-amber-600 dark:text-amber-400" : "text-teal-600 dark:text-teal-400"}`}>
                  {effectiveHalf}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{effectiveHalfPct.toFixed(2)}% • {fmt(effectiveHalfRisk)}</div>
              </div>
            </div>

            {/* Plage APD */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border-2 border-yellow-200 dark:border-yellow-800">
              <div>
                <div className="text-xs text-muted-foreground">Taille plage déclenchement</div>
                <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{triggerRange.toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Borne au dessus (APD)</div>
                <div className="text-lg font-bold">{upperBound.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Borne en dessous (APD)</div>
                <div className="text-lg font-bold">{lowerBound.toFixed(3)}</div>
              </div>
            </div>

            {/* Bouton swing */}
            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                className="gap-2 border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => setSwingDialogOpen(true)}
                disabled={!code || effectiveShares === 0}
              >
                <PlusCircle className="h-4 w-4" />
                Ajouter au plan swing
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Le money management ────────────────────────────────── */}
      <Card className="border-2 border-green-200 dark:border-green-800">
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-b-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-bold uppercase tracking-wide">Le money management</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {/* Paramètres */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Capital (€)</Label>
              <Input
                type="number" step="0.01" value={capital}
                onChange={e => { setCapital(e.target.value); localStorage.setItem("psc_capital", e.target.value); saveCapital(e.target.value); }}
                className="h-10 text-right font-bold bg-cyan-50 dark:bg-cyan-900/40 border-2 border-cyan-300 dark:border-cyan-700"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Risque base (%)</Label>
              <Input
                type="number" step="0.01" value={baseRiskInput}
                onChange={e => { setBaseRiskInput(e.target.value); localStorage.setItem("psc_baseRisk", e.target.value); saveBaseRisk(e.target.value); }}
                className="h-10 text-right font-bold bg-pink-50 dark:bg-pink-900/40 border-2 border-pink-300 dark:border-pink-700"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Ligne max (%)</Label>
              <Input
                type="number" step="0.5" min="0" max="100" value={maxLinePercent}
                onChange={e => { setMaxLinePercent(e.target.value); saveMaxLine(e.target.value); }}
                className="h-10 text-right font-bold bg-violet-50 dark:bg-violet-900/40 border-2 border-violet-300 dark:border-violet-700"
              />
            </div>
          </div>

          {/* Tableau money management */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-xs w-[30%]"></th>
                  {PROFILES.map(p => (
                    <th
                      key={p.key}
                      className={`px-3 py-3 text-center text-white font-bold border border-gray-200 dark:border-gray-700 cursor-pointer transition-all select-none ${p.headerCls} ${riskProfile === p.key ? "ring-2 ring-inset ring-white/60" : "opacity-80"}`}
                      onClick={() => setRiskProfile(p.key)}
                    >
                      <div className="text-base tracking-wide">{p.fullLabel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* % risque */}
                <tr className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                  <td className={tdLabel}>% risque</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} ${riskProfile === d.key ? "font-semibold" : "text-muted-foreground"}`}>
                      {fmtN(d.riskPct, 2)}%
                    </td>
                  ))}
                </tr>
                {/* Risque en € */}
                <tr className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                  <td className={tdLabel}>Risque en €</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} ${riskProfile === d.key ? "font-semibold" : "text-muted-foreground"}`}>
                      {cap > 0 ? fmtN(d.riskEur, 0) + " €" : "–"}
                    </td>
                  ))}
                </tr>
                {/* Achat - fond bleu */}
                <tr className="bg-blue-100 dark:bg-blue-900/30">
                  <td className={`${tdLabel} bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300`}>Achat</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 ${riskProfile === d.key ? "font-bold" : ""}`}>
                      {buy > 0 ? fmtN(buy, 2) + " €" : "–"}
                    </td>
                  ))}
                </tr>
                {/* Stop loss - fond marron/ambre */}
                <tr style={{ backgroundColor: "rgba(180,120,60,0.15)" }}>
                  <td className={tdLabel} style={{ color: "#92400e" }}>Stop loss</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} ${riskProfile === d.key ? "font-bold" : ""}`} style={{ color: "#92400e" }}>
                      {stop > 0 ? fmtN(stop, 2) + " €" : "–"}
                    </td>
                  ))}
                </tr>
                {/* Nombre de titres */}
                <tr className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                  <td className={tdLabel}>Nombre de titres</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} ${riskProfile === d.key ? "font-bold text-base" : "text-muted-foreground"}`}>
                      {d.nbTitres > 0 ? d.nbTitres : "–"}
                    </td>
                  ))}
                </tr>
                {/* Poids ligne */}
                <tr className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                  <td className={tdLabel}>Poids ligne</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} ${riskProfile === d.key ? "font-semibold" : "text-muted-foreground"}`}>
                      {d.nbTitres > 0 && buy > 0 ? fmtN(d.nbTitres * buy, 0) + " €" : "–"}
                    </td>
                  ))}
                </tr>
                {/* % du Capital engagé */}
                <tr className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                  <td className={tdLabel}>% du Capital engagé</td>
                  {tableData.map(d => (
                    <td key={d.key} className={`${tdBase} ${riskProfile === d.key ? "font-semibold" : "text-muted-foreground"}`}>
                      {d.nbTitres > 0 && buy > 0 && cap > 0 ? fmtN((d.nbTitres * buy / cap) * 100, 1) + "%" : "–"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Légende profil actif */}
          <div className="mt-3 text-xs text-muted-foreground text-center">
            Cliquez sur une colonne pour sélectionner le profil actif dans la calculette
          </div>
        </CardContent>
      </Card>

      <SwingPlanDialog
        open={swingDialogOpen}
        onOpenChange={setSwingDialogOpen}
        initialValues={{
          code,
          name,
          quantity: effectiveShares,
          limitPrice: parseFloat(buyPrice) || 0,
          stopPrice: parseFloat(stopLoss) || 0,
          riskAmount,
          apd: upperBound || undefined,
        }}
        onSaved={async (entry) => {
          try { await addSwingPlan(entry); } catch (e) { console.error(e); }
        }}
      />
    </div>
  );
}
