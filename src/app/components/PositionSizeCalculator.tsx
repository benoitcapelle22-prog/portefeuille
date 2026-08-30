import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Loader2, PlusCircle } from "lucide-react";
import { SwingPlanDialog } from "./SwingPlanDialog";
import { addSwingPlan, getSetting, setSetting } from "../db";
import { formatCurrency as formatCurrencyUtil, formatNumber } from "../utils/format";

type ProfileKey = "faible" | "moyen" | "normal" | "agressif";

const PROFILES: { key: ProfileKey; fullLabel: string; mult: number; color: string }[] = [
  { key: "faible",   fullLabel: "FAIBLE",   mult: 0.50, color: "#7aaa8a" },
  { key: "moyen",    fullLabel: "MOYEN",    mult: 0.75, color: "#c8b460" },
  { key: "normal",   fullLabel: "NORMAL",   mult: 1.00, color: "#d48060" },
  { key: "agressif", fullLabel: "AGRESSIF", mult: 2.00, color: "#c45040" },
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

  const tableData = PROFILES.map(profile => {
    const riskPct = baseRiskValue * profile.mult;
    const riskEur = cap * riskPct / 100;
    const nbTitres = riskPerAction > 0 ? Math.floor(riskEur / riskPerAction) : 0;
    return { key: profile.key, riskPct, riskEur, nbTitres };
  });

  const fmt = (v: number, d = 2) => formatCurrencyUtil(v, "EUR", d);
  const fmtN = (v: number, d = 2) => formatNumber(v, d);

  const tdBase = "px-3 py-2 text-center text-sm border-b border-r border-border transition-colors";
  const tdLabel = "px-3 py-2 text-xs font-medium text-left border-b border-r border-border text-muted-foreground whitespace-nowrap";
  const tdSel = (selected: boolean) => selected ? "font-semibold text-foreground" : "text-muted-foreground";
  const selBorderSide = (selected: boolean): React.CSSProperties =>
    selected ? { borderLeft: `2px solid ${profileConfig.color}`, borderRight: `2px solid ${profileConfig.color}` } : {};
  const selBorderTop = (selected: boolean): React.CSSProperties =>
    selected ? { borderLeft: `2px solid ${profileConfig.color}`, borderRight: `2px solid ${profileConfig.color}`, borderTop: `2px solid ${profileConfig.color}` } : {};
  const selBorderBottom = (selected: boolean): React.CSSProperties =>
    selected ? { borderLeft: `2px solid ${profileConfig.color}`, borderRight: `2px solid ${profileConfig.color}`, borderBottom: `2px solid ${profileConfig.color}` } : {};

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
<CardContent className="p-6">
          <div className="grid gap-5">

            {/* Paramètres */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Capital (€)</Label>
                <Input
                  type="number" step="0.01" value={capital}
                  onChange={e => { setCapital(e.target.value); localStorage.setItem("psc_capital", e.target.value); saveCapital(e.target.value); }}
                  className="text-right font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Risque base (%)</Label>
                <Input
                  type="number" step="0.01" value={baseRiskInput}
                  onChange={e => { setBaseRiskInput(e.target.value); localStorage.setItem("psc_baseRisk", e.target.value); saveBaseRisk(e.target.value); }}
                  className="text-right font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ligne max (%)</Label>
                <Input
                  type="number" step="0.5" min="0" max="100" value={maxLinePercent}
                  onChange={e => { setMaxLinePercent(e.target.value); saveMaxLine(e.target.value); }}
                  className="text-right font-semibold"
                />
              </div>
            </div>

            {/* Action : code, nom, achat, stop — tout sur une ligne */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-end">
              <div className="space-y-1.5 w-32">
                <Label className="text-xs flex items-center gap-1">
                  Code {fetchLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </Label>
                <Input
                  type="text"
                  placeholder="MC.PA"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); nameTouchedRef.current = false; }}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nom</Label>
                <Input
                  type="text"
                  placeholder="Nom de l'action"
                  value={name}
                  onChange={e => { setName(e.target.value); nameTouchedRef.current = true; }}
                />
              </div>
              <div className="space-y-1.5 w-32">
                <Label className="text-xs">Prix d'achat</Label>
                <Input
                  type="number" step="0.01" value={buyPrice}
                  onChange={e => setBuyPrice(e.target.value)}
                  className="text-right font-semibold"
                />
              </div>
              <div className="space-y-1.5 w-32">
                <Label className="text-xs">Stop loss</Label>
                <Input
                  type="number" step="0.01" value={stopLoss}
                  onChange={e => setStopLoss(e.target.value)}
                  className="text-right font-semibold"
                />
              </div>
              <Badge variant={stopPercent < 0 ? "destructive" : "secondary"} className="h-9 px-3 text-sm flex items-center mb-0.5">
                {stopPercent.toFixed(2)}%
              </Badge>
            </div>

            {/* Tableau */}
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs text-muted-foreground border-b border-r border-border bg-muted/40 w-[28%]"></th>
                    {PROFILES.map(p => (
                      <th
                        key={p.key}
                        style={{ backgroundColor: p.color, ...selBorderTop(riskProfile === p.key) }}
                        className={`px-3 py-2.5 text-center text-white font-bold text-sm border-b border-r border-border cursor-pointer select-none transition-all ${riskProfile === p.key ? "opacity-100" : "opacity-60 hover:opacity-80"}`}
                        onClick={() => setRiskProfile(p.key)}
                      >
                        {p.fullLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdLabel}>% risque</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} ${tdSel(riskProfile === d.key)}`}>
                        {fmtN(d.riskPct, 2)}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={tdLabel}>Risque en €</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} ${tdSel(riskProfile === d.key)}`}>
                        {cap > 0 ? fmtN(d.riskEur, 0) + " €" : "–"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${tdLabel} bg-positive/10 text-positive`}>Achat</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} bg-positive/10 text-positive ${riskProfile === d.key ? "font-semibold" : "opacity-60"}`}>
                        {buy > 0 ? fmtN(buy, 2) + " €" : "–"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${tdLabel} bg-negative/10 text-negative`}>Stop loss</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} bg-negative/10 text-negative ${riskProfile === d.key ? "font-semibold" : "opacity-60"}`}>
                        {stop > 0 ? fmtN(stop, 2) + " €" : "–"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={tdLabel}>Nombre de titres</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} ${tdSel(riskProfile === d.key)} ${riskProfile === d.key ? "text-base" : ""}`}>
                        {d.nbTitres > 0 ? d.nbTitres : "–"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={tdLabel}>Poids ligne</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} ${tdSel(riskProfile === d.key)}`}>
                        {d.nbTitres > 0 && buy > 0 ? fmtN(d.nbTitres * buy, 0) + " €" : "–"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={tdLabel}>% du Capital engagé</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderSide(riskProfile === d.key)} className={`${tdBase} ${tdSel(riskProfile === d.key)}`}>
                        {d.nbTitres > 0 && buy > 0 && cap > 0 ? fmtN((d.nbTitres * buy / cap) * 100, 1) + "%" : "–"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${tdLabel} border-b-0`}>Borne au dessus (APD)</td>
                    {tableData.map(d => (
                      <td key={d.key} style={selBorderBottom(riskProfile === d.key)} className={`${tdBase} border-b-0 ${tdSel(riskProfile === d.key)}`}>
                        {buy > 0 ? upperBound.toFixed(3) : "–"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Résultats profil sélectionné */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  Actions à acheter
                  {isLineSizeConstrained && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">ligne max</span>
                  )}
                </div>
                <div className="text-3xl font-bold">{effectiveShares}</div>
                <div className="text-xs text-muted-foreground mt-1">{fmtN(riskPerAction)} € / action</div>
              </div>
              <div className="text-center border-l border-r border-border">
                <div className="text-xs text-muted-foreground mb-1">Montant investi</div>
                <div className="text-2xl font-bold">{fmt(effectiveInvested, 0)}</div>
                <div className="text-xs text-muted-foreground mt-1">{effectivePct.toFixed(2)}% du PTF</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">½ position</div>
                <div className="text-3xl font-bold">{effectiveHalf}</div>
                <div className="text-xs text-muted-foreground mt-1">{effectiveHalfPct.toFixed(2)}% • {fmt(effectiveHalfRisk)}</div>
              </div>
            </div>

            {/* Bouton swing */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
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
