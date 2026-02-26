import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Calculator, TrendingUp, Shield, Target } from "lucide-react";

export function PositionSizeCalculator() {
  const [capital, setCapital] = useState("16000.00");
  const [buyPrice, setBuyPrice] = useState("7.3");
  const [stopLoss, setStopLoss] = useState("6.76");
  const [riskPercent, setRiskPercent] = useState("0.50");
  const [baseRiskInput, setBaseRiskInput] = useState("0.50");
  const [riskProfile, setRiskProfile] = useState<"speculatif" | "prudent" | "normal" | "agressif">("normal");
  
  // DECOTES
  const [indexTrendUp, setIndexTrendUp] = useState(true);
  const [stockTrendUp, setStockTrendUp] = useState(true);
  const [goodLiquidity, setGoodLiquidity] = useState(true);
  const [goodFundamentals, setGoodFundamentals] = useState(true);
  const [stockShorted, setStockShorted] = useState(true);
  const [managersInvested, setManagersInvested] = useState(true);

  const calculate = () => {
    const cap = parseFloat(capital);
    const buy = parseFloat(buyPrice);
    const stop = parseFloat(stopLoss);
    const risk = parseFloat(riskPercent);

    if (!cap || !buy || !stop || !risk) {
      return {
        riskAmount: 0,
        stopPercent: 0,
        riskPerAction: 0,
        maxShares: 0,
        maxInvested: 0,
        percentOfPortfolio: 0,
        halfPosition: 0,
        halfPercent: 0,
        halfRiskAmount: 0,
        triggerRange: 0,
        upperBound: 0,
        lowerBound: 0,
        baseRisk: 0.25,
        finalRisk: 0.50,
      };
    }

    // Calcul du risque final selon le profil
    const baseRiskValue = parseFloat(baseRiskInput);
    let finalRisk = baseRiskValue;
    
    if (riskProfile === "prudent") {
      finalRisk = baseRiskValue * 0.75;
    } else if (riskProfile === "normal") {
      finalRisk = baseRiskValue;
    } else if (riskProfile === "agressif") {
      finalRisk = baseRiskValue * 2;
    } else if (riskProfile === "speculatif") {
      finalRisk = baseRiskValue * 0.5;
    }

    // Risque en montant = capital × risque final
    const riskAmount = (cap * finalRisk) / 100;
    const riskPerAction = Math.abs(buy - stop);
    const maxShares = riskPerAction > 0 ? Math.floor(riskAmount / riskPerAction) : 0;
    const maxInvested = maxShares * buy;
    const percentOfPortfolio = cap > 0 ? (maxInvested / cap) * 100 : 0;
    const stopPercent = buy > 0 ? ((stop - buy) / buy) * 100 : 0;

    const halfPosition = Math.floor(maxShares / 2);
    const halfPercent = cap > 0 ? (halfPosition * buy / cap) * 100 : 0;
    const halfRiskAmount = halfPosition * riskPerAction;

    // Calcul plage déclenchement
    const triggerRange = 0.35;
    const upperBound = buy * (1 + triggerRange / 100);
    const lowerBound = buy * (1 - triggerRange / 100);

    // Calcul risque de base (0.25% si tous O)
    const countYes = [indexTrendUp, stockTrendUp, goodLiquidity, goodFundamentals, stockShorted, managersInvested].filter(Boolean).length;
    
    // Risque de base selon profil
    const riskProfiles = {
      speculatif: 1.0,
      prudent: 0.25,
      normal: 0.50,
      agressif: 0.75,
    };
    const baseRisk = riskProfiles[riskProfile];

    return {
      riskAmount,
      stopPercent,
      riskPerAction,
      maxShares,
      maxInvested,
      percentOfPortfolio,
      halfPosition,
      halfPercent,
      halfRiskAmount,
      triggerRange,
      upperBound,
      lowerBound,
      baseRisk,
      finalRisk,
    };
  };

  const result = calculate();

  const formatCurrency = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value) + " €";
  };

  const formatPercent = (value: number) => {
    return value.toFixed(2) + "%";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Calculette principale */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-b-2">
          <div className="flex items-center gap-3">
            <Calculator className="h-6 w-6 text-primary" />
            <CardTitle className="text-lg font-bold uppercase tracking-wide">
              Calculette Money Management
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-4">
            {/* Risque du trade */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Risque du trade</Label>
              <div className="flex gap-2">
                <div className="h-12 flex items-center justify-end font-bold text-lg text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900 rounded-md border-2 border-cyan-300 dark:border-cyan-700 px-3 flex-1">
                  {formatPercent(result.finalRisk)}
                </div>
                <div className="flex flex-col items-end justify-center bg-cyan-200 dark:bg-cyan-800 rounded-md px-4 font-bold min-w-[120px]">
                  <div className="text-xs text-gray-600 dark:text-gray-300 font-normal">Risque en montant</div>
                  <div className="text-base">{formatCurrency(result.riskAmount)}</div>
                </div>
              </div>
            </div>

            {/* Prix d'achat et STOP */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Prix d'achat</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="h-12 text-right font-bold text-lg border-2"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">STOP</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="h-12 text-right font-bold text-lg border-2"
                />
              </div>
              <Badge variant={result.stopPercent < 0 ? "destructive" : "default"} className="h-12 px-3 text-sm flex items-center">
                {formatPercent(result.stopPercent)}
              </Badge>
            </div>

            {/* Résultats principaux */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 rounded-lg border-2 border-blue-200 dark:border-blue-800">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">Nombre actions maxi</div>
                <div className="text-3xl font-bold text-primary">{result.maxShares}</div>
                <div className="text-xs text-muted-foreground mt-1">{formatCurrency(result.riskPerAction)} par action</div>
              </div>
              <div className="text-center border-l-2 border-r-2 border-blue-200 dark:border-blue-800">
                <div className="text-sm text-muted-foreground mb-1">Capital maxi investi</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(result.maxInvested, 0)}</div>
                <div className="text-xs text-muted-foreground mt-1">{formatPercent(result.percentOfPortfolio)} du PTF</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">½ POSITION</div>
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{result.halfPosition}</div>
                <div className="text-xs text-muted-foreground mt-1">{formatPercent(result.halfPercent)} • {formatCurrency(result.halfRiskAmount)}</div>
              </div>
            </div>

            {/* Plage déclenchement APD */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border-2 border-yellow-200 dark:border-yellow-800">
              <div>
                <div className="text-xs text-muted-foreground">Taille plage déclenchement</div>
                <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{formatPercent(result.triggerRange)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Borne au dessus pour APD</div>
                <div className="text-lg font-bold">{result.upperBound.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Borne en dessous pour APD</div>
                <div className="text-lg font-bold">{result.lowerBound.toFixed(3)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Conseil de MM */}
      <Card className="border-2 border-green-200 dark:border-green-800">
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-b-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <CardTitle className="font-bold text-[18px]">RISQUE</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Capital du portefeuille */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Capital du portefeuille complet</Label>
              <Input
                type="number"
                step="0.01"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="h-12 text-right font-bold text-lg bg-cyan-100 dark:bg-cyan-900 border-2 border-cyan-300 dark:border-cyan-700"
              />
            </div>

            {/* Profil de risque */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Profil de risque</Label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    setRiskProfile("speculatif");
                  }}
                  className={`h-12 rounded-lg font-bold text-sm transition-all ${
                    riskProfile === "speculatif"
                      ? "bg-gradient-to-r from-red-400 to-red-600 dark:from-red-600 dark:to-red-800 text-white scale-105 shadow-lg"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  SPÉCULATIF
                </button>
                <button
                  onClick={() => {
                    setRiskProfile("prudent");
                  }}
                  className={`h-12 rounded-lg font-bold text-sm transition-all ${
                    riskProfile === "prudent"
                      ? "bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-600 dark:to-blue-800 text-white scale-105 shadow-lg"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  PRUDENT
                </button>
                <button
                  onClick={() => {
                    setRiskProfile("normal");
                  }}
                  className={`h-12 rounded-lg font-bold text-sm transition-all ${
                    riskProfile === "normal"
                      ? "bg-gradient-to-r from-green-400 to-green-600 dark:from-green-600 dark:to-green-800 text-white scale-105 shadow-lg"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  NORMAL
                </button>
                <button
                  onClick={() => {
                    setRiskProfile("agressif");
                  }}
                  className={`h-12 rounded-lg font-bold text-sm transition-all ${
                    riskProfile === "agressif"
                      ? "bg-gradient-to-r from-orange-400 to-orange-600 dark:from-orange-600 dark:to-orange-800 text-white scale-105 shadow-lg"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  AGRESSIF
                </button>
              </div>
            </div>

            {/* Risque de base et Risque final */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 rounded-lg border-2 border-emerald-200 dark:border-emerald-800">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Risque de base</div>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    value={baseRiskInput}
                    onChange={(e) => setBaseRiskInput(e.target.value)}
                    className="h-12 text-right font-bold text-lg bg-pink-100 dark:bg-pink-900 border-2 border-pink-300 dark:border-pink-700 pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-lg text-pink-600 dark:text-pink-400">%</span>
                </div>
              </div>
              <div className="border-l-2 border-emerald-200 dark:border-emerald-800 pl-4">
                <div className="text-xs text-muted-foreground mb-1">Risque final</div>
                <div className="h-12 flex items-center justify-end font-bold text-lg text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/50 rounded-md border-2 border-cyan-300 dark:border-cyan-700 px-3">
                  {formatPercent(result.finalRisk)}
                </div>
              </div>
            </div>

            {/* Message conseil */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <Target className="h-4 w-4 text-blue-600" />
              <span>Ajustez le risque selon la stratégie de marché</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}