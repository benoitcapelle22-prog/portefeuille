import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Position } from "./CurrentPositions";
import { Transaction } from "./TransactionForm";
import { ClosedPosition } from "./ClosedPositions";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Activity, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { AaplQuoteWidget } from "./AaplQuoteWidget";

// Palette de couleurs pour les graphiques
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1', '#D084D0', '#A4DE6C'];

interface DashboardProps {
  positions: Position[];
  transactions: Transaction[];
  closedPositions: ClosedPosition[];
  portfolioCurrency?: string;
  cash?: number;
}

export function Dashboard({ positions, transactions, closedPositions, portfolioCurrency = "EUR", cash = 0 }: DashboardProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: portfolioCurrency
    }).format(value);
  };

  // Filtrer les transactions par date
  const filteredTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.date);
    const matchesStart = !startDate || transactionDate >= new Date(startDate);
    const matchesEnd = !endDate || transactionDate <= new Date(endDate);
    return matchesStart && matchesEnd;
  });

  // Filtrer les positions clôturées par date
  const filteredClosedPositions = closedPositions.filter(p => {
    const saleDate = new Date(p.saleDate);
    const matchesStart = !startDate || saleDate >= new Date(startDate);
    const matchesEnd = !endDate || saleDate <= new Date(endDate);
    return matchesStart && matchesEnd;
  });

  const hasActiveFilters = startDate !== "" || endDate !== "";

  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
  };

  // Calculs des statistiques globales avec données filtrées
  const totalInvested = positions.reduce((sum, pos) => sum + pos.totalCost, 0);
  const totalValue = positions.reduce((sum, pos) => sum + (pos.totalValue || 0), 0);
  const unrealizedGainLoss = totalValue - totalInvested;
  const unrealizedGainLossPercent = totalInvested > 0 ? (unrealizedGainLoss / totalInvested) * 100 : 0;

  const realizedGainLoss = filteredClosedPositions.reduce((sum, pos) => sum + (pos.gainLoss || 0), 0);
  
  const totalDividends = filteredTransactions
    .filter(t => t.type === "dividende")
    .reduce((sum, t) => sum + (t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0), 0);

  const totalGainLoss = unrealizedGainLoss + realizedGainLoss + totalDividends;
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  // Statistiques de succès/échec
  const successfulTrades = filteredClosedPositions.filter(p => (p.gainLoss || 0) > 0).length;
  const failedTrades = filteredClosedPositions.filter(p => (p.gainLoss || 0) < 0).length;
  const breakEvenTrades = filteredClosedPositions.filter(p => (p.gainLoss || 0) === 0).length;
  const totalTrades = filteredClosedPositions.length;
  const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;

  // Ratio gain/perte
  const totalGains = filteredClosedPositions
    .filter(p => (p.gainLoss || 0) > 0)
    .reduce((sum, p) => sum + (p.gainLoss || 0), 0);
  const totalLosses = Math.abs(filteredClosedPositions
    .filter(p => (p.gainLoss || 0) < 0)
    .reduce((sum, p) => sum + (p.gainLoss || 0), 0));
  const gainLossRatio = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? Infinity : 0;

  // Données pour le graphique de répartition du portefeuille
  const portfolioDistribution = positions
    .filter(p => p.totalValue && p.totalValue > 0)
    .map(p => ({
      name: p.code,
      value: p.totalValue || 0,
      percent: totalValue > 0 ? ((p.totalValue || 0) / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Données pour la répartition par secteur
  const sectorDistribution = positions
    .filter(p => p.totalValue && p.totalValue > 0)
    .reduce((acc, p) => {
      const sector = p.sector || "Non défini";
      const existing = acc.find(item => item.sector === sector);
      if (existing) {
        existing.value += p.totalValue || 0;
      } else {
        acc.push({ sector, value: p.totalValue || 0 });
      }
      return acc;
    }, [] as { sector: string; value: number }[])
    .map(item => ({
      name: item.sector,
      value: item.value,
      percent: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Données pour le graphique d'évolution du portefeuille
  const portfolioEvolution = filteredTransactions
    .filter(t => t.type === "achat" || t.type === "vente")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce((acc, transaction) => {
      const date = new Date(transaction.date).toLocaleDateString('fr-FR', { 
        month: 'short', 
        year: 'numeric' 
      });
      
      const lastEntry = acc[acc.length - 1];
      const previousValue = lastEntry ? lastEntry.value : 0;
      
      let newValue = previousValue;
      if (transaction.type === "achat") {
        newValue += (transaction.quantity * transaction.unitPrice * transaction.conversionRate) + 
                    (transaction.fees * transaction.conversionRate) + 
                    (transaction.tff * transaction.conversionRate);
      } else if (transaction.type === "vente") {
        newValue -= (transaction.quantity * transaction.unitPrice * transaction.conversionRate) - 
                    (transaction.fees * transaction.conversionRate) - 
                    (transaction.tff * transaction.conversionRate);
      }
      
      const existing = acc.find(item => item.date === date);
      if (existing) {
        existing.value = newValue;
      } else {
        acc.push({ date, value: newValue });
      }
      
      return acc;
    }, [] as { date: string; value: number }[]);

  // Données pour le graphique des performances par titre
  const performanceByStock = positions
    .filter(p => p.gainLoss !== undefined)
    .map(p => ({
      name: p.code,
      gainLoss: p.gainLoss || 0,
      percent: p.gainLossPercent || 0,
    }))
    .sort((a, b) => b.gainLoss - a.gainLoss)
    .slice(0, 10);

  // Statistiques des dividendes
  const dividendsByMonth = filteredTransactions
    .filter(t => t.type === "dividende")
    .reduce((acc, t) => {
      const month = new Date(t.date).toLocaleDateString('fr-FR', { 
        month: 'short', 
        year: 'numeric' 
      });
      const amount = (t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0);
      
      const existing = acc.find(item => item.month === month);
      if (existing) {
        existing.amount += amount;
      } else {
        acc.push({ month, amount });
      }
      
      return acc;
    }, [] as { month: string; amount: number }[])
    .sort((a, b) => {
      const [monthA, yearA] = a.month.split(' ');
      const [monthB, yearB] = b.month.split(' ');
      return new Date(`${monthA} 1, ${yearA}`).getTime() - new Date(`${monthB} 1, ${yearB}`).getTime();
    });

  return (
    <div className="space-y-6">
      {/* Barre de filtres de dates */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex gap-2 items-center">
              <label className="text-sm font-medium">Date de début:</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-sm font-medium">Date de fin:</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
              >
                <X className="h-4 w-4 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cartes de statistiques */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valeur totale</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Investi: {formatCurrency(totalInvested)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gain/Perte latent</CardTitle>
            {unrealizedGainLoss >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(unrealizedGainLoss)}
            </div>
            <p className="text-xs text-muted-foreground">
              {unrealizedGainLossPercent >= 0 ? '+' : ''}{unrealizedGainLossPercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gain/Perte réalisé</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${realizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(realizedGainLoss)}
            </div>
            <p className="text-xs text-muted-foreground">
              Positions clôturées
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dividendes reçus</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalDividends)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total cumulé
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Répartition du portefeuille */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition du portefeuille</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioDistribution.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={portfolioDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${percent.toFixed(1)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {portfolioDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Répartition par secteur */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par secteur</CardTitle>
          </CardHeader>
          <CardContent>
            {sectorDistribution.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${percent.toFixed(1)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sectorDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance par titre */}
        <Card>
          <CardHeader>
            <CardTitle>Performance par titre (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {performanceByStock.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceByStock}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value as number)}
                      labelFormatter={(label) => `Code: ${label}`}
                    />
                    <Bar dataKey="gainLoss" fill="#8884d8">
                      {performanceByStock.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.gainLoss >= 0 ? '#00C49F' : '#FF8042'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Évolution du capital investi */}
        <Card>
          <CardHeader>
            <CardTitle>Évolution du capital investi</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioEvolution.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={portfolioEvolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      name="Capital investi"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dividendes par mois */}
        <Card>
          <CardHeader>
            <CardTitle>Dividendes reçus par mois</CardTitle>
          </CardHeader>
          <CardContent>
            {dividendsByMonth.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dividendsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Bar dataKey="amount" fill="#00C49F" name="Dividendes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Résumé global */}
      <Card>
        <CardHeader>
          <CardTitle>Performance globale</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Gain/Perte Total</p>
              <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalGainLoss)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%
              </p>
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

      {/* Statistiques de trading */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiques de trading</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Transactions réussies</p>
              <p className="text-2xl font-bold text-green-600">{successfulTrades}</p>
              <p className="text-xs text-muted-foreground">
                Gains positifs
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Transactions en échec</p>
              <p className="text-2xl font-bold text-red-600">{failedTrades}</p>
              <p className="text-xs text-muted-foreground">
                Pertes
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Taux de réussite</p>
              <p className={`text-2xl font-bold ${successRate >= 50 ? 'text-green-600' : 'text-orange-600'}`}>
                {successRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">
                {successfulTrades}/{totalTrades} trades
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ratio Gain/Perte</p>
              <p className={`text-2xl font-bold ${gainLossRatio >= 1 ? 'text-green-600' : 'text-orange-600'}`}>
                {gainLossRatio === Infinity ? '∞' : gainLossRatio.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(totalGains)} / {formatCurrency(totalLosses)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Gain moyen</p>
              <p className="text-2xl font-bold text-green-600">
                {successfulTrades > 0 ? formatCurrency(totalGains / successfulTrades) : formatCurrency(0)}
              </p>
              <p className="text-xs text-muted-foreground">
                Par trade gagnant
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Perte moyenne</p>
              <p className="text-2xl font-bold text-red-600">
                {failedTrades > 0 ? formatCurrency(totalLosses / failedTrades) : formatCurrency(0)}
              </p>
              <p className="text-xs text-muted-foreground">
                Par trade perdant
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}