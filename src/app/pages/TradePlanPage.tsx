import { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { MoreHorizontal, RefreshCw, PlusCircle, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SwingPlanEntry, SwingPlanDialog } from "../components/SwingPlanDialog";
import { getSwingPlans, addSwingPlan, updateSwingPlanStatus, updateSwingPlanNotes, deleteSwingPlan, updatePositionStopLoss } from "../db";
import { TransactionDialog } from "../components/TransactionDialog";
import { usePortfolio } from "../components/PortfolioLayout";
import { Transaction } from "../components/TransactionForm";

function NotesInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  const commit = () => { onSave(inputRef.current?.value ?? ""); };

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      placeholder="—"
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } }}
      className="w-full min-w-[140px] border rounded px-2 py-1 text-sm bg-background"
    />
  );
}

const STATUS_LABELS: Record<SwingPlanEntry["status"], string> = {
  actif: "Actif",
  déclenché: "Déclenché",
  expiré: "Expiré",
  annulé: "Annulé",
  gagné: "Gagné",
  perdant: "Perdant",
};

const STATUS_VARIANTS: Record<SwingPlanEntry["status"], "default" | "secondary" | "outline" | "destructive"> = {
  actif: "default",
  déclenché: "secondary",
  expiré: "outline",
  annulé: "destructive",
  gagné: "default",
  perdant: "destructive",
};

const STATUS_CLASS: Partial<Record<SwingPlanEntry["status"], string>> = {
  gagné: "bg-green-600 hover:bg-green-700 text-white",
  perdant: "bg-red-600 hover:bg-red-700 text-white",
};

function fmt(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("fr-FR");
}

function fmtNum(v: number | null | undefined, digits = 4) {
  if (v == null) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(v);
}

function SwingPlanTab() {
  const { portfolios, currentPortfolioId, handleAddTransaction } = usePortfolio();
  const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId) ?? portfolios[0];

  const [plans, setPlans] = useState<SwingPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggerPlan, setTriggerPlan] = useState<SwingPlanEntry | null>(null);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Tri persisté
  type SortKey = "date" | "validityDate" | "code" | "name" | "quantity" | "limitPrice" | "stopPrice" | "riskAmount" | "tp1" | "status" | "gain" | "gainPct";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>(() => (localStorage.getItem("swingSort_key") as SortKey) ?? "date");
  const [sortDir, setSortDir] = useState<SortDir>(() => (localStorage.getItem("swingSort_dir") as SortDir) ?? "desc");

  useEffect(() => { localStorage.setItem("swingSort_key", sortKey); }, [sortKey]);
  useEffect(() => { localStorage.setItem("swingSort_dir", sortDir); }, [sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const Th = ({ col, children, className = "" }: { col: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 whitespace-nowrap ${className}`} onClick={() => handleSort(col)}>
      {children}<SortIcon col={col} />
    </TableHead>
  );

  // Filtres persistés
  const [search, setSearch] = useState(() => localStorage.getItem("swingFilter_search") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem("swingFilter_status") ?? "tous");
  const [dateFrom, setDateFrom] = useState(() => localStorage.getItem("swingFilter_from") ?? "");
  const [dateTo, setDateTo] = useState(() => localStorage.getItem("swingFilter_to") ?? "");

  useEffect(() => { localStorage.setItem("swingFilter_search", search); }, [search]);
  useEffect(() => { localStorage.setItem("swingFilter_status", statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem("swingFilter_from", dateFrom); }, [dateFrom]);
  useEffect(() => { localStorage.setItem("swingFilter_to", dateTo); }, [dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await getSwingPlans());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id: string, status: SwingPlanEntry["status"]) => {
    await updateSwingPlanStatus(id, status);
    setPlans(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  const handleDelete = async (id: string) => {
    await deleteSwingPlan(id);
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const handleNotes = async (id: string, notes: string) => {
    await updateSwingPlanNotes(id, notes || null);
    setPlans(prev => prev.map(p => p.id === id ? { ...p, notes: notes || null } : p));
  };

  const handleTrigger = (plan: SwingPlanEntry) => {
    setTriggerPlan(plan);
    setTransactionDialogOpen(true);
  };

  const handleTransactionAdded = async (transaction: Omit<Transaction, "id">, portfolioId?: string) => {
    await handleAddTransaction(transaction, portfolioId);
    const targetPortfolioId = portfolioId ?? currentPortfolioId;
    if (triggerPlan?.stopPrice && targetPortfolioId && transaction.type === "achat") {
      await updatePositionStopLoss(targetPortfolioId, transaction.code, triggerPlan.stopPrice);
    }
    if (triggerPlan?.id) {
      await handleStatus(triggerPlan.id, "déclenché");
    }
    setTriggerPlan(null);
  };

  const filteredPlans = plans.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== "tous" && p.status !== statusFilter) return false;
    if (dateFrom && p.date < dateFrom) return false;
    if (dateTo && p.date > dateTo) return false;
    return true;
  });

  const sortedFilteredPlans = [...filteredPlans].sort((a, b) => {
    const gain = (p: SwingPlanEntry) => p.salePrice != null ? (p.salePrice - p.limitPrice) * p.quantity : -Infinity;
    const gainPct = (p: SwingPlanEntry) => p.salePrice != null && p.limitPrice > 0 ? (p.salePrice - p.limitPrice) / p.limitPrice * 100 : -Infinity;
    let aVal: any, bVal: any;
    switch (sortKey) {
      case "date":        aVal = a.date;        bVal = b.date;        break;
      case "validityDate": aVal = a.validityDate; bVal = b.validityDate; break;
      case "code":        aVal = a.code;        bVal = b.code;        break;
      case "name":        aVal = a.name;        bVal = b.name;        break;
      case "quantity":    aVal = a.quantity;    bVal = b.quantity;    break;
      case "limitPrice":  aVal = a.limitPrice;  bVal = b.limitPrice;  break;
      case "stopPrice":   aVal = a.stopPrice;   bVal = b.stopPrice;   break;
      case "riskAmount":  aVal = a.riskAmount;  bVal = b.riskAmount;  break;
      case "tp1":         aVal = a.tp1 ?? -Infinity; bVal = b.tp1 ?? -Infinity; break;
      case "status":      aVal = a.status;      bVal = b.status;      break;
      case "gain":        aVal = gain(a);        bVal = gain(b);        break;
      case "gainPct":     aVal = gainPct(a);     bVal = gainPct(b);     break;
      default:            aVal = ""; bVal = "";
    }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal, "fr") : bVal.localeCompare(aVal, "fr");
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const hasFilters = search !== "" || statusFilter !== "tous" || dateFrom !== "" || dateTo !== "";
  const resetFilters = () => { setSearch(""); setStatusFilter("tous"); setDateFrom(""); setDateTo(""); };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Chargement…</div>;
  if (error) return <div className="py-12 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-3">
      {/* Barre de filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher code ou nom…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="déclenché">Déclenché</SelectItem>
            <SelectItem value="gagné">Gagné</SelectItem>
            <SelectItem value="perdant">Perdant</SelectItem>
            <SelectItem value="expiré">Expiré</SelectItem>
            <SelectItem value="annulé">Annulé</SelectItem>
          </SelectContent>
        </Select>

        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 w-36" title="Date de début" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 w-36" title="Date de fin" />

        {hasFilters && (
          <Button variant="outline" size="sm" className="h-9" onClick={resetFilters}>
            <X className="h-3 w-3 mr-1" /> Réinitialiser
          </Button>
        )}

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={load}>
            <RefreshCw className="h-3 w-3 mr-1" /> Actualiser
          </Button>
          <Button size="sm" className="h-9" onClick={() => setCreateDialogOpen(true)}>
            <PlusCircle className="h-3 w-3 mr-1" /> Nouveau plan
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <Th col="date">Date</Th>
              <Th col="validityDate">Validité</Th>
              <Th col="code">Code</Th>
              <Th col="name">Nom</Th>
              <Th col="quantity" className="text-right">Qté</Th>
              <Th col="limitPrice" className="text-right">Prix limite</Th>
              <Th col="stopPrice" className="text-right">Stop</Th>
              <Th col="riskAmount" className="text-right">Risque (€)</Th>
              <Th col="tp1" className="text-right">TP1</Th>
              <Th col="status">Statut</Th>
              <Th col="gain" className="text-right">Gain (€)</Th>
              <Th col="gainPct" className="text-right">Gain %</Th>
              <TableHead>Commentaire</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFilteredPlans.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-10 text-muted-foreground">
                  {hasFilters ? "Aucun plan ne correspond aux filtres." : "Aucun plan de swing trading. Utilisez la calculatrice pour en créer un."}
                </TableCell>
              </TableRow>
            )}
            {sortedFilteredPlans.map(plan => (
              <TableRow key={plan.id} className={plan.status === "expiré" || plan.status === "annulé" ? "opacity-50" : ""}>
                <TableCell className="whitespace-nowrap">{fmt(plan.date)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt(plan.validityDate)}</TableCell>
                <TableCell className="font-mono font-medium">{plan.code}</TableCell>
                <TableCell className="max-w-[180px] truncate">{plan.name}</TableCell>
                <TableCell className="text-right">{plan.quantity}</TableCell>
                <TableCell className="text-right font-medium">{fmtNum(plan.limitPrice)}</TableCell>
                <TableCell className="text-right text-red-600">{fmtNum(plan.stopPrice)}</TableCell>
                <TableCell className="text-right">{fmtNum(plan.riskAmount, 2)}</TableCell>
                <TableCell className="text-right text-green-600">{fmtNum(plan.tp1)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[plan.status]} className={STATUS_CLASS[plan.status] ?? ""}>
                    {STATUS_LABELS[plan.status]}
                  </Badge>
                </TableCell>
                {(() => {
                  const gain = plan.salePrice != null
                    ? (plan.salePrice - plan.limitPrice) * plan.quantity
                    : null;
                  const gainPct = plan.salePrice != null && plan.limitPrice > 0
                    ? ((plan.salePrice - plan.limitPrice) / plan.limitPrice) * 100
                    : null;
                  const cls = gain != null ? (gain >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium") : "text-muted-foreground";
                  return (
                    <>
                      <TableCell className={`text-right ${cls}`}>
                        {gain != null ? `${gain >= 0 ? "+" : ""}${fmtNum(gain, 2)} €` : "—"}
                      </TableCell>
                      <TableCell className={`text-right ${cls}`}>
                        {gainPct != null ? `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%` : "—"}
                      </TableCell>
                    </>
                  );
                })()}
                <TableCell className="min-w-[160px]">
                  <NotesInput
                    value={plan.notes ?? ""}
                    onSave={v => handleNotes(plan.id!, v)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleTrigger(plan)}>
                        Déclencher → créer transaction
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleStatus(plan.id!, "actif")}>
                        Marquer Actif
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatus(plan.id!, "expiré")}>
                        Marquer Expiré
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatus(plan.id!, "annulé")}>
                        Marquer Annulé
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(plan.id!)}>
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SwingPlanDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initialValues={{ code: "", name: "", quantity: 0, limitPrice: 0, stopPrice: 0, riskAmount: 0 }}
        onSaved={async entry => {
          try {
            await addSwingPlan(entry);
            await load();
          } catch (e) { console.error(e); }
        }}
      />

      <TransactionDialog
        open={transactionDialogOpen}
        onOpenChange={open => {
          setTransactionDialogOpen(open);
          if (!open) setTriggerPlan(null);
        }}
        onAddTransaction={handleTransactionAdded}
        currentPortfolio={currentPortfolio}
        portfolios={portfolios}
        initialData={triggerPlan ? {
          code: triggerPlan.code,
          name: triggerPlan.name,
          type: "achat",
          quantity: triggerPlan.quantity,
          unitPrice: triggerPlan.limitPrice,
        } : undefined}
      />
    </div>
  );
}

export function TradePlanPage() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Suivi de plan de trade</h1>
      <Tabs defaultValue="swing">
        <TabsList>
          <TabsTrigger value="swing">Plan swing trading</TabsTrigger>
          <TabsTrigger value="lt">Plan long terme</TabsTrigger>
        </TabsList>
        <TabsContent value="swing" className="mt-4">
          <SwingPlanTab />
        </TabsContent>
        <TabsContent value="lt" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Plan long terme — à venir
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
