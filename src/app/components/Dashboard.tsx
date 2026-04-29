import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Position } from "./CurrentPositions";
import { Transaction } from "./TransactionForm";
import { ClosedPosition } from "./ClosedPositions";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Activity, Wallet, X, ArrowUp, ArrowDown, Minus, Info } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1', '#D084D0', '#A4DE6C'];

type Tab = "valorisation" | "performance" | "trading";

interface DashboardProps {
  positions: Position[];
  transactions: Transaction[];
  closedPositions: ClosedPosition[];
  portfolioCurrency?: string;
  cash?: number;
  totalPortfolio?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getYear(dateStr: string): number {
  // Supporte DD/MM/YYYY et YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return parseInt(dateStr.split("/")[2]);
  }
  return new Date(dateStr).getFullYear();
}

function getMonth(dateStr: string): number {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return parseInt(dateStr.split("/")[1]) - 1;
  }
  return new Date(dateStr).getMonth();
}

function deltaColor(val: number, higherIsBetter = true) {
  if (val === 0) return "text-muted-foreground";
  return (val > 0) === higherIsBetter ? "text-green-600" : "text-red-600";
}

function DeltaBadge({ val, unit = "", higherIsBetter = true, fmt }: {
  val: number;
  unit?: string;
  higherIsBetter?: boolean;
  fmt?: (v: number) => string;
}) {
  const color = deltaColor(val, higherIsBetter);
  const Icon = val > 0 ? ArrowUp : val < 0 ? ArrowDown : Minus;
  const label = fmt ? fmt(Math.abs(val)) : `${Math.abs(val).toFixed(1)}${unit}`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Calcul des stats pour une année ──────────────────────────────────────────

function calcStats(closed: ClosedPosition[], year: number) {
  const cp = closed.filter(p => getYear(p.saleDate) === year);
  const successful = cp.filter(p => (p.gainLoss || 0) > 0);
  const failed     = cp.filter(p => (p.gainLoss || 0) < 0);
  const totalTrades = cp.length;
  const successRate = totalTrades > 0 ? (successful.length / totalTrades) * 100 : 0;
  const gains  = successful.reduce((s, p) => s + (p.gainLoss || 0), 0);
  const losses = Math.abs(failed.reduce((s, p) => s + (p.gainLoss || 0), 0));
  const ratio  = losses > 0 ? gains / losses : gains > 0 ? Infinity : 0;
  const avgGain = successful.length > 0 ? gains / successful.length : 0;
  const avgLoss = failed.length     > 0 ? losses / failed.length    : 0;
  return { totalTrades, successful: successful.length, failed: failed.length, successRate, gains, losses, ratio, avgGain, avgLoss };
}

// ── Calcul courbe cumul mensuel pour une année ────────────────────────────────

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function cumulByMonth(closed: ClosedPosition[], year: number): { month: string; value: number }[] {
  const result: { month: string; value: number }[] = [];
  let cumul = 0;
  for (let m = 0; m < 12; m++) {
    const trades = closed.filter(p => getYear(p.saleDate) === year && getMonth(p.saleDate) === m);
    cumul += trades.reduce((s, p) => s + (p.gainLoss || 0), 0);
    result.push({ month: MONTH_LABELS[m], value: cumul });
  }
  return result;
}

// ── Composant principal ───────────────────────────────────────────────────────

export function Dashboard({
  positions,
  transactions,
  closedPositions,
  portfolioCurrency = "EUR",
  cash = 0,
  totalPortfolio: totalPortfolioProp,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>("valorisation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: portfolioCurrency }).format(value);

  // Années disponibles pour l'onglet valorisation/performance
  const availableYearsValPerf = useMemo(() => {
    const txYears = transactions.map(t => getYear(t.date));
    const cpYears = closedPositions.map(p => getYear(p.saleDate));
    const years = Array.from(new Set([...txYears, ...cpYears])).sort((a, b) => b - a);
    return years;
  }, [transactions, closedPositions]);

  const filteredTransactions = transactions.filter(t => {
    const d = new Date(t.date);
    const matchYear = yearFilter === "all" || getYear(t.date) === parseInt(yearFilter);
    return matchYear && (!startDate || d >= new Date(startDate)) && (!endDate || d <= new Date(endDate));
  });

  const filteredClosedPositions = closedPositions.filter(p => {
    const d = new Date(p.saleDate);
    const matchYear = yearFilter === "all" || getYear(p.saleDate) === parseInt(yearFilter);
    return matchYear && (!startDate || d >= new Date(startDate)) && (!endDate || d <= new Date(endDate));
  });

  const hasActiveFilters = startDate !== "" || endDate !== "" || yearFilter !== "all";
  const resetFilters = () => { setStartDate(""); setEndDate(""); setYearFilter("all"); };

  // Années disponibles dans les positions clôturées (onglet trading)
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(closedPositions.map(p => getYear(p.saleDate)))).sort((a, b) => b - a);
    return years.length > 0 ? years : [currentYear];
  }, [closedPositions]);

  // ── Calculs valorisation ──────────────────────────────────────────────────
  const totalInvested  = positions.reduce((sum, p) => sum + p.totalCost, 0);
  const totalValue     = positions.reduce((sum, p) => sum + (p.totalValue || p.totalCost), 0);
  const totalPortfolio = (totalPortfolioProp !== undefined && totalPortfolioProp > 0)
    ? totalPortfolioProp : totalValue + cash;

  const unrealizedGainLoss        = totalValue - totalInvested;
  const unrealizedGainLossPercent = totalInvested > 0 ? (unrealizedGainLoss / totalInvested) * 100 : 0;

  // Reconstruction du capital investi et des liquidités à la date de fin du filtre (replay transactions)
  const historicalPortfolio = useMemo(() => {
    const cutoff = endDate || (yearFilter !== "all" ? `${yearFilter}-12-31` : null);
    if (!cutoff) return null;

    const posMap = new Map<string, { totalCost: number; quantity: number }>();
    let historicalCash = 0;

    const sorted = [...transactions]
      .filter(t => t.date <= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const t of sorted) {
      const conv = t.conversionRate || 1;
      switch (t.type) {
        case "achat": {
          const cost = t.quantity * t.unitPrice * conv + (t.fees || 0) + (t.tff || 0);
          const ex = posMap.get(t.code);
          if (ex) { ex.totalCost += cost; ex.quantity += t.quantity; }
          else posMap.set(t.code, { totalCost: cost, quantity: t.quantity });
          historicalCash -= cost;
          break;
        }
        case "vente": {
          const ex = posMap.get(t.code);
          if (ex && ex.quantity > 0) {
            const pru = ex.totalCost / ex.quantity;
            ex.quantity -= t.quantity;
            ex.totalCost -= pru * t.quantity;
            if (ex.quantity <= 0) posMap.delete(t.code);
          }
          historicalCash += t.quantity * t.unitPrice * conv - (t.fees || 0);
          break;
        }
        case "depot":    historicalCash += t.unitPrice; break;
        case "retrait":  historicalCash -= t.unitPrice; break;
        case "frais":    historicalCash -= t.unitPrice; break;
        case "interets": historicalCash += t.unitPrice; break;
        case "dividende": historicalCash += t.quantity * t.unitPrice * conv - (t.tax || 0) * conv; break;
      }
    }

    const totalCost = Array.from(posMap.values()).reduce((s, p) => s + Math.max(0, p.totalCost), 0);
    return { totalCost, cash: historicalCash };
  }, [transactions, yearFilter, endDate]);

  const isHistorical = historicalPortfolio !== null;
  const displayCash           = isHistorical ? historicalPortfolio.cash : cash;
  const displayTotalValue     = isHistorical ? historicalPortfolio.totalCost : totalValue;
  const displayTotalPortfolio = isHistorical ? historicalPortfolio.totalCost + historicalPortfolio.cash : totalPortfolio;
  const realizedGainLoss          = filteredClosedPositions.reduce((sum, p) => sum + (p.gainLoss || 0), 0);
  const totalDividends            = filteredTransactions
    .filter(t => t.type === "dividende")
    .reduce((sum, t) => sum + t.unitPrice * t.quantity * t.conversionRate - (t.tax || 0) * t.conversionRate, 0);
  const totalGainLoss        = unrealizedGainLoss + realizedGainLoss + totalDividends;
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  // ── Calculs performance ───────────────────────────────────────────────────
  const performanceByStock = positions
    .filter(p => p.latentGainLoss !== undefined)
    .map(p => ({ name: p.code, gainLoss: p.latentGainLoss || 0, percent: p.latentGainLossPercent || 0 }))
    .sort((a, b) => b.gainLoss - a.gainLoss).slice(0, 10);

  const portfolioEvolution = filteredTransactions
    .filter(t => t.type === "achat" || t.type === "vente")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce((acc, t) => {
      const date = new Date(t.date).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
      const prev = acc[acc.length - 1]?.value || 0;
      let v = prev;
      if (t.type === "achat") v += t.quantity * t.unitPrice * t.conversionRate + t.fees * t.conversionRate + t.tff * t.conversionRate;
      else v -= t.quantity * t.unitPrice * t.conversionRate - t.fees * t.conversionRate - t.tff * t.conversionRate;
      const ex = acc.find(i => i.date === date);
      if (ex) ex.value = v; else acc.push({ date, value: v });
      return acc;
    }, [] as { date: string; value: number }[]);

  const dividendsByMonth = filteredTransactions
    .filter(t => t.type === "dividende")
    .reduce((acc, t) => {
      const month = new Date(t.date).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
      const amount = t.unitPrice * t.quantity * t.conversionRate - (t.tax || 0) * t.conversionRate;
      const ex = acc.find(i => i.month === month);
      if (ex) ex.amount += amount; else acc.push({ month, amount });
      return acc;
    }, [] as { month: string; amount: number }[])
    .sort((a, b) => {
      const [mA, yA] = a.month.split(" ");
      const [mB, yB] = b.month.split(" ");
      return new Date(`${mA} 1, ${yA}`).getTime() - new Date(`${mB} 1, ${yB}`).getTime();
    });

  const portfolioDistribution = positions
    .filter(p => (p.totalValue || p.totalCost) > 0)
    .map(p => ({ name: p.code, value: p.totalValue || p.totalCost, percent: totalValue > 0 ? ((p.totalValue || p.totalCost) / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const sectorDistribution = positions
    .filter(p => (p.totalValue || p.totalCost) > 0)
    .reduce((acc, p) => {
      const sector = p.sector || "Non défini";
      const val = p.totalValue || p.totalCost;
      const ex = acc.find(i => i.sector === sector);
      if (ex) ex.value += val; else acc.push({ sector, value: val });
      return acc;
    }, [] as { sector: string; value: number }[])
    .map(i => ({ name: i.sector, value: i.value, percent: totalValue > 0 ? (i.value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  // ── Calculs stat trading N / N-1 ─────────────────────────────────────────
  const N   = selectedYear;
  const N1  = selectedYear - 1;
  const sN  = calcStats(closedPositions, N);
  const sN1 = calcStats(closedPositions, N1);

  const cumulN  = cumulByMonth(closedPositions, N);
  const cumulN1 = cumulByMonth(closedPositions, N1);

  // Pour l'année N en cours : null sur les mois pas encore écoulés
  const todayMonth = new Date().getMonth(); // 0-based
  const isCurrentYear = N === new Date().getFullYear();

  const cumulData = MONTH_LABELS.map((month, i) => ({
    month,
    [String(N)]:  (isCurrentYear && i > todayMonth) ? null : cumulN[i].value,
    [String(N1)]: cumulN1[i].value,
  }));

  // Barres groupées N vs N-1
  const barData = [
    { metric: "Trades",         n: sN.totalTrades,  n1: sN1.totalTrades  },
    { metric: "Gagnants",       n: sN.successful,   n1: sN1.successful   },
    { metric: "Perdants",       n: sN.failed,       n1: sN1.failed       },
  ];

  const gainBarData = [
    { metric: "Gains",          n: sN.gains,        n1: sN1.gains        },
    { metric: "Pertes",         n: sN.losses,       n1: sN1.losses       },
    { metric: "Gain moy.",      n: sN.avgGain,      n1: sN1.avgGain      },
    { metric: "Perte moy.",     n: sN.avgLoss,      n1: sN1.avgLoss      },
  ];

  // ── Tableau récap ─────────────────────────────────────────────────────────
  const tableRows = [
    { label: "Nb trades",         vN: sN.totalTrades,  vN1: sN1.totalTrades,  fmt: (v: number) => String(v),            higherIsBetter: true  },
    { label: "Trades gagnants",   vN: sN.successful,   vN1: sN1.successful,   fmt: (v: number) => String(v),            higherIsBetter: true  },
    { label: "Trades perdants",   vN: sN.failed,       vN1: sN1.failed,       fmt: (v: number) => String(v),            higherIsBetter: false },
    { label: "Taux de réussite",  vN: sN.successRate,  vN1: sN1.successRate,  fmt: (v: number) => `${v.toFixed(1)}%`,   higherIsBetter: true  },
    { label: "Ratio Gain/Perte",  vN: sN.ratio === Infinity ? 999 : sN.ratio, vN1: sN1.ratio === Infinity ? 999 : sN1.ratio, fmt: (v: number) => v >= 999 ? "∞" : v.toFixed(2), higherIsBetter: true },
    { label: "Gains totaux",      vN: sN.gains,        vN1: sN1.gains,        fmt: formatCurrency,                      higherIsBetter: true  },
    { label: "Pertes totales",    vN: sN.losses,       vN1: sN1.losses,       fmt: formatCurrency,                      higherIsBetter: false },
    { label: "Gains/Pertes net",  vN: sN.gains - sN.losses, vN1: sN1.gains - sN1.losses, fmt: formatCurrency,             higherIsBetter: true  },
    { label: "Gain moyen",        vN: sN.avgGain,      vN1: sN1.avgGain,      fmt: formatCurrency,                      higherIsBetter: true  },
    { label: "Perte moyenne",     vN: sN.avgLoss,      vN1: sN1.avgLoss,      fmt: formatCurrency,                      higherIsBetter: false },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "valorisation", label: "📊 Valorisation" },
    { key: "performance",  label: "📈 Performance"  },
    { key: "trading",      label: "🎯 Stat Trading"  },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Onglets */}
      <div className="flex gap-2 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtre dates + année (valorisation + performance) */}
      {activeTab !== "trading" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3 items-center flex-wrap">
              <select
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background text-foreground"
              >
                <option value="all">Toutes les années</option>
                {availableYearsValPerf.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="flex gap-2 items-center">
                <label className="text-sm font-medium">Date de début :</label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-sm font-medium">Date de fin :</label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" /> Réinitialiser
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sélecteur d'année (stat trading) */}
      {activeTab === "trading" && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Année de référence :</span>
          <div className="flex gap-1">
            {availableYears.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  selectedYear === y
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}>
                {y}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ONGLET 1 — VALORISATION ═══════════════════════════════════════ */}
      {activeTab === "valorisation" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valeur totale</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(displayTotalPortfolio)}</div>
                <p className="text-xs text-muted-foreground">
                  {isHistorical ? "Capital investi" : "Titres"} : {formatCurrency(displayTotalValue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Gain/Perte latent{isHistorical ? " (actuel)" : ""}
                </CardTitle>
                {unrealizedGainLoss >= 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${unrealizedGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(unrealizedGainLoss)}</div>
                <p className="text-xs text-muted-foreground">{unrealizedGainLossPercent >= 0 ? "+" : ""}{unrealizedGainLossPercent.toFixed(2)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gain/Perte réalisé</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${realizedGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(realizedGainLoss)}</div>
                <p className="text-xs text-muted-foreground">Positions clôturées</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dividendes reçus</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalDividends)}</div>
                <p className="text-xs text-muted-foreground">Total cumulé</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Répartition du portefeuille</CardTitle></CardHeader>
              <CardContent>
                {portfolioDistribution.length === 0 ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p> : (
                  <div className="h-[220px] sm:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={portfolioDistribution} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${percent.toFixed(1)}%)`} outerRadius={80} dataKey="value">
                          {portfolioDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Répartition par secteur</CardTitle></CardHeader>
              <CardContent>
                {sectorDistribution.length === 0 ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p> : (
                  <div className="h-[220px] sm:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sectorDistribution} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${percent.toFixed(1)}%)`} outerRadius={80} dataKey="value">
                          {sectorDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Évolution du capital investi</CardTitle></CardHeader>
              <CardContent>
                {portfolioEvolution.length === 0 ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p> : (
                  <div className="h-[220px] sm:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={portfolioEvolution}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis />
                        <Tooltip formatter={(v) => formatCurrency(v as number)} /><Legend />
                        <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} name="Capital investi" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Dividendes reçus par mois</CardTitle></CardHeader>
              <CardContent>
                {dividendsByMonth.length === 0 ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p> : (
                  <div className="h-[220px] sm:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dividendsByMonth}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis />
                        <Tooltip formatter={(v) => formatCurrency(v as number)} /><Legend />
                        <Bar dataKey="amount" fill="#00C49F" name="Dividendes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ ONGLET 2 — PERFORMANCE ════════════════════════════════════════ */}
      {activeTab === "performance" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Performance globale</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Gain/Perte Total</p>
                  <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(totalGainLoss)}</p>
                  <p className="text-xs text-muted-foreground">{totalGainLossPercent >= 0 ? "+" : ""}{totalGainLossPercent.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nombre de positions</p>
                  <p className="text-2xl font-bold">{positions.length}</p>
                  <p className="text-xs text-muted-foreground">En cours</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Positions clôturées</p>
                  <p className="text-2xl font-bold">{closedPositions.length}</p>
                  <p className="text-xs text-muted-foreground">Historique</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Performance par titre (Top 10)</CardTitle></CardHeader>
            <CardContent>
              {performanceByStock.length === 0 ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p> : (
                <div className="h-[240px] sm:h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceByStock}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis />
                      <Tooltip formatter={(v) => formatCurrency(v as number)} labelFormatter={(l) => `Code: ${l}`} />
                      <Bar dataKey="gainLoss" fill="#8884d8">
                        {performanceByStock.map((e, i) => <Cell key={i} fill={e.gainLoss >= 0 ? "#00C49F" : "#FF8042"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ ONGLET 3 — STAT TRADING N / N-1 ══════════════════════════════ */}
      {activeTab === "trading" && (
        <div className="space-y-6">

          {/* KPI avec delta */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Nb trades",        vN: sN.totalTrades,  vN1: sN1.totalTrades,  fmt: (v: number) => String(v),          hib: true  },
              { label: "Taux de réussite", vN: sN.successRate,  vN1: sN1.successRate,  fmt: (v: number) => `${v.toFixed(1)}%`, hib: true  },
              { label: "Ratio G/P",        vN: sN.ratio === Infinity ? 999 : sN.ratio, vN1: sN1.ratio === Infinity ? 999 : sN1.ratio, fmt: (v: number) => v >= 999 ? "∞" : v.toFixed(2), hib: true },
              { label: "Gain moyen",       vN: sN.avgGain,      vN1: sN1.avgGain,      fmt: formatCurrency,                    hib: true  },
              { label: "Perte moyenne",    vN: sN.avgLoss,      vN1: sN1.avgLoss,      fmt: formatCurrency,                    hib: false },
            ].map(({ label, vN, vN1, fmt, hib }) => {
              const delta = vN - vN1;
              return (
                <Card key={label}>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium flex items-center gap-1">
                      {label}
                      {label === "Ratio G/P" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-56 text-center">
                            Un ratio de 2 signifie que vous avez gagné 2€ pour chaque euro perdu (sur positions clôturées uniquement).
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{fmt(vN)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">N-1 : {fmt(vN1)}</span>
                      {vN1 !== 0 && <DeltaBadge val={delta} higherIsBetter={hib} fmt={fmt} />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Tableau récapitulatif */}
          <Card>
            <CardHeader><CardTitle>Récapitulatif {N} vs {N1}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Métrique</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">{N1}</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">{N}</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Évolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ label, vN, vN1, fmt, higherIsBetter }) => {
                      const delta = vN - vN1;
                      return (
                        <tr key={label} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 font-medium">
                            <span className="flex items-center gap-1">
                              {label}
                              {label === "Ratio Gain/Perte" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-56 text-center">
                                    Un ratio de 2 signifie que vous avez gagné 2€ pour chaque euro perdu (sur positions clôturées uniquement).
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                          </td>
                          <td className="text-right py-2 text-muted-foreground">{fmt(vN1)}</td>
                          <td className="text-right py-2 font-semibold">{fmt(vN)}</td>
                          <td className="text-right py-2">
                            {vN1 !== 0
                              ? <DeltaBadge val={delta} higherIsBetter={higherIsBetter} fmt={fmt} />
                              : <span className="text-xs text-muted-foreground">—</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Graphiques côte à côte */}
          <div className="grid gap-4 md:grid-cols-2">

            {/* Barres groupées — nombre de trades */}
            <Card>
              <CardHeader><CardTitle>Trades {N} vs {N1}</CardTitle></CardHeader>
              <CardContent>
                {sN.totalTrades === 0 && sN1.totalTrades === 0
                  ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
                  : <div className="h-[200px] sm:h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="metric" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="n1" name={String(N1)} fill="#94a3b8" radius={[4,4,0,0]} />
                          <Bar dataKey="n"  name={String(N)}  fill="#0088FE" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                }
              </CardContent>
            </Card>

            {/* Barres groupées — gains / pertes */}
            <Card>
              <CardHeader><CardTitle>Gains & Pertes {N} vs {N1}</CardTitle></CardHeader>
              <CardContent>
                {sN.gains === 0 && sN1.gains === 0
                  ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
                  : <div className="h-[200px] sm:h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={gainBarData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="metric" />
                          <YAxis />
                          <Tooltip formatter={(v) => formatCurrency(v as number)} />
                          <Legend />
                          <Bar dataKey="n1" name={String(N1)} fill="#94a3b8" radius={[4,4,0,0]} />
                          <Bar dataKey="n"  name={String(N)}  fill="#00C49F" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                }
              </CardContent>
            </Card>

            {/* Courbes cumulées mensuelles N vs N-1 */}
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Gains/Pertes cumulés mois par mois — {N} vs {N1}</CardTitle></CardHeader>
              <CardContent>
                {sN.totalTrades === 0 && sN1.totalTrades === 0
                  ? <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
                  : <div className="h-[220px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cumulData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip formatter={(v) => formatCurrency(v as number)} />
                          <Legend />
                          <Line type="monotone" dataKey={String(N1)} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
                          <Line type="monotone" dataKey={String(N)}  stroke="#0088FE" strokeWidth={2} dot={false} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                }
              </CardContent>
            </Card>

          </div>
        </div>
      )}

    </div>
  );
}