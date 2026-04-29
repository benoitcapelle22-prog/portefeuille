import { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { PortfolioSelector, Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { Position } from "./CurrentPositions";
import { ClosedPosition } from "./ClosedPositions";
import { TransactionDialog } from "./TransactionDialog";
import { DividendDialog } from "./DividendDialog";
import { ImportTransactions } from "./ImportTransactions";
import { TrendingUp, LayoutDashboard, Receipt, Calculator, Download, Upload, HardDrive, PauseCircle, RotateCcw, MoreVertical, RefreshCw, Globe, History } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import {
  getPortfolios,
  getTransactions,
  getPositions,
  getClosedPositions,
  createPortfolio as dbCreatePortfolio,
  updatePortfolio as dbUpdatePortfolio,
  deletePortfolio as dbDeletePortfolio,
  addTransaction as dbAddTransaction,
  deleteTransaction as dbDeleteTransaction,
  deleteTransactionsByPortfolio,
  upsertPosition,
  bulkUpsertPositions,
  deletePositionsByPortfolio,
  deletePosition as dbDeletePosition,
  addClosedPosition,
  bulkAddClosedPositions,
  deleteClosedPositionsByPortfolio,
  getCurrentPortfolioId,
  setCurrentPortfolioId as saveCurrentPortfolioId,
  updatePortfolio,
  bulkAddTransactions,
  updatePositionQuantityAndCost,
  updatePositionStopLoss,
  updatePositionManualPrice,
  DBTransaction,
  DBPosition,
  DBClosedPosition,
} from "../db";
import { supabase } from "../supabase";
import { useExchangeRates } from "../hooks/useExchangeRates";
import { useQuotes } from "../hooks/useQuotes";
import { backfillHistoricalPrices } from "../../services/pricesHistory";
import {
  exportDatabase,
  importDatabase,
  pickAutoBackupFile,
  startAutoBackupToFile,
  stopAutoBackup,
  saveAutoBackupSetting,
  clearAutoBackupSetting,
  loadAutoBackupSetting,
} from "../utils/backup";

export interface PortfolioData {
  transactions: Transaction[];
  positions: Position[];
  closedPositions: ClosedPosition[];
}

export interface PortfolioContextType {
  portfolios: Portfolio[];
  currentPortfolioId: string | null;
  currentPortfolio: Portfolio | undefined;
  currentData: PortfolioData;
  handleCreatePortfolio: (portfolio: Omit<Portfolio, "id">) => Promise<void>;
  handleUpdatePortfolio: (id: string, portfolio: Omit<Portfolio, "id">) => Promise<void>;
  handleDeletePortfolio: (id: string) => Promise<void>;
  setCurrentPortfolioId: (id: string) => Promise<void>;
  handleAddTransaction: (transaction: Omit<Transaction, "id">, portfolioId?: string) => Promise<void>;
  handleImportTransactions: (transactions: Omit<Transaction, "id">[]) => Promise<void>;
  handleDeleteTransaction: (id: string) => Promise<void>;
  handleEditTransaction: (updated: Transaction) => Promise<void>;
  handlePositionAction: (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => void;
  handleUpdateCash: (amount: number, type: "deposit" | "withdrawal", date: string) => Promise<void>;
  handleUpdateStopLoss: (code: string, stopLoss: number | undefined) => Promise<void>;
  handleUpdateCurrentPrice: (code: string, manualCurrentPrice: number | undefined) => Promise<void>;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  dialogInitialData: any;
  setDialogInitialData: (data: any) => void;
  refreshData: () => Promise<void>;
  recalcCashFromDB: (portfolioId: string) => Promise<void>;
  totalPortfolio: number;
  setTotalPortfolio: (value: number) => void;
  quotesBySymbol: Record<string, { price: number | null }>;
  refreshQuotes: () => Promise<void>;
  quotesLoading: boolean;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio must be used within PortfolioLayout");
  return context;
};

export function PortfolioLayout() {
  const location = useLocation();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioIdState] = useState<string | null>(null);
  const [portfolioData, setPortfolioData] = useState<Record<string, PortfolioData>>({});
  const { rates } = useExchangeRates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialData, setDialogInitialData] = useState<any>({});
  const [dividendDialogOpen, setDividendDialogOpen] = useState(false);
  const [dividendDialogInitialData, setDividendDialogInitialData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupNeedsPermission, setAutoBackupNeedsPermission] = useState(false);
  const [totalPortfolio, setTotalPortfolio] = useState(0);
  const [importTxOpen, setImportTxOpen] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // HELPER : parse date DD/MM/YYYY ou YYYY-MM-DD
  // ============================================================

  const parseDate = (d: string): number => {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      const [day, month, year] = d.split('/');
      return new Date(`${year}-${month}-${day}`).getTime();
    }
    return new Date(d).getTime();
  };

  // ============================================================
  // HELPER : recalcul du cash depuis zéro à partir des transactions
  //   depot     → + unitPrice  (montant brut en devise portefeuille)
  //   retrait   → - unitPrice
  //   frais     → - unitPrice
  //   interets  → + unitPrice
  //   achat     → - (qté × prix × taux + frais + tff)
  //   vente     → + (qté × prix × taux - frais - tff)
  //   dividende → + (qté × prix × taux - taxe)
  // ============================================================

  const recalcCash = (transactions: Transaction[]): number => {
    return transactions.reduce((cash, t) => {
      const converted = t.unitPrice * (t.conversionRate || 1);
      switch (t.type) {
        case "depot":
          return cash + t.unitPrice;
        case "retrait":
          return cash - t.unitPrice;
        case "frais":
          return cash - t.unitPrice;
        case "interets":
          return cash + t.unitPrice;
        case "achat":
          return cash - (t.quantity * converted + (t.fees || 0) + (t.tff || 0));
        case "vente":
          return cash + (t.quantity * converted - (t.fees || 0) - (t.tff || 0));
        case "dividende":
          return cash + (t.quantity * converted - ((t as any).tax || 0));
        default:
          return cash;
      }
    }, 0);
  };

  // ============================================================
  // CHARGEMENT DES DONNÉES
  // ============================================================

  const refreshData = useCallback(async () => {
    try {
      const [allPortfolios, allTransactions, allPositions, allClosedPositions] = await Promise.all([
        getPortfolios(),
        getTransactions(),
        getPositions(),
        getClosedPositions(),
      ]);

      setPortfolios(allPortfolios);

      const data: Record<string, PortfolioData> = {};
      for (const portfolio of allPortfolios) {
        const pid = portfolio.id;
        const transactions: Transaction[] = allTransactions
          .filter(t => t.portfolioId === pid)
          .map(({ portfolioId, ...t }) => t as Transaction);
        const positions: Position[] = allPositions
          .filter(p => p.portfolioId === pid)
          .map(({ portfolioId, id, ...p }) => p as Position);
        const closedPositions: ClosedPosition[] = allClosedPositions
          .filter(cp => cp.portfolioId === pid)
          .map(({ portfolioId, id, ...cp }) => cp as ClosedPosition);
        data[pid] = { transactions, positions, closedPositions };
      }
      setPortfolioData(data);
    } catch (err) {
      console.error('Erreur chargement données:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await refreshData();
        const savedCurrentId = await getCurrentPortfolioId();
        const loadedPortfolios = await getPortfolios();

        if (savedCurrentId && loadedPortfolios.find(p => p.id === savedCurrentId)) {
          setCurrentPortfolioIdState(savedCurrentId);
        } else if (loadedPortfolios.length > 0) {
          setCurrentPortfolioIdState(loadedPortfolios[0].id);
          await saveCurrentPortfolioId(loadedPortfolios[0].id);
        } else {
          const defaultPortfolio: Portfolio = {
            id: crypto.randomUUID(),
            name: "Mon portefeuille principal",
            category: "Trading",
            currency: "EUR",
            fees: { defaultFeesPercent: 0, defaultFeesMin: 0, defaultTFF: 0 },
            cash: 0,
          };
          await dbCreatePortfolio(defaultPortfolio);
          setCurrentPortfolioIdState(defaultPortfolio.id);
          await saveCurrentPortfolioId(defaultPortfolio.id);
          await refreshData();
        }
      } catch (err) {
        console.error('Erreur initialisation:', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // ============================================================
  // AUTO BACKUP
  // ============================================================

  useEffect(() => {
    const initAutoBackup = async () => {
      const setting = await loadAutoBackupSetting();
      if (!setting || !setting.enabled || !setting.fileHandle) {
        setAutoBackupEnabled(false);
        setAutoBackupNeedsPermission(false);
        return;
      }
      try {
        const perm = await setting.fileHandle.queryPermission({ mode: "readwrite" });
        if (perm === "granted") {
          startAutoBackupToFile(setting.fileHandle, { intervalMs: 5 * 60 * 1000 });
          setAutoBackupEnabled(true);
        } else {
          setAutoBackupEnabled(false);
          setAutoBackupNeedsPermission(true);
        }
      } catch {
        setAutoBackupEnabled(false);
        setAutoBackupNeedsPermission(true);
      }
    };
    initAutoBackup();
  }, []);

  const onEnableAutoBackup = async () => {
    try {
      const handle = await pickAutoBackupFile();
      await saveAutoBackupSetting(handle);
      startAutoBackupToFile(handle, { intervalMs: 5 * 60 * 1000 });
      setAutoBackupEnabled(true);
      alert("✅ Sauvegarde automatique activée.");
    } catch (err) {
      setAutoBackupEnabled(false);
      alert(err instanceof Error ? `❌ ${err.message}` : "❌ Impossible d'activer la sauvegarde automatique.");
    }
  };

  const onDisableAutoBackup = async () => {
    try {
      stopAutoBackup();
      setAutoBackupEnabled(false);
      await clearAutoBackupSetting();
      alert("🛑 Sauvegarde automatique désactivée.");
    } catch {
      alert("❌ Impossible de désactiver la sauvegarde automatique.");
    }
  };

  const onReauthorizeAutoBackup = async () => {
    const setting = await loadAutoBackupSetting();
    if (!setting?.fileHandle) return;
    try {
      const request = await setting.fileHandle.requestPermission({ mode: "readwrite" });
      if (request !== "granted") { alert("❌ Permission refusée."); return; }
      startAutoBackupToFile(setting.fileHandle, { intervalMs: 5 * 60 * 1000 });
      setAutoBackupEnabled(true);
      setAutoBackupNeedsPermission(false);
      alert("✅ Sauvegarde automatique réactivée.");
    } catch {
      alert("❌ Impossible de réactiver la sauvegarde automatique.");
    }
  };

  // ============================================================
  // IMPORT / RESET
  // ============================================================

  const handleResetDatabase = async () => {
    const ok = window.confirm("⚠️ Supprimer toutes les données ?\n\nContinuer ?");
    if (!ok) return;
    try {
      await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('positions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('closed_positions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('daily_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('portfolios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('settings').delete().neq('key', '__never__');
      alert("✅ Base vidée. L'application va se recharger.");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("❌ Impossible de vider la base.");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = window.confirm("⚠️ Importer ce fichier va remplacer toutes les données actuelles.\n\nContinuer ?");
    if (!ok) { e.target.value = ""; return; }
    try {
      const text = await file.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        alert("❌ Fichier invalide : ce n'est pas un JSON valide.");
        e.target.value = "";
        return;
      }
      await importDatabase(data);
      alert("✅ Import terminé !");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("❌ Import impossible.");
    } finally {
      e.target.value = "";
    }
  };

  // ============================================================
  // PORTEFEUILLES
  // ============================================================

  const setCurrentPortfolioId = async (id: string) => {
    setCurrentPortfolioIdState(id);
    await saveCurrentPortfolioId(id);
    await refreshData();
  };

  const handleCreatePortfolio = async (portfolio: Omit<Portfolio, "id">) => {
    const newPortfolio: Portfolio = { id: crypto.randomUUID(), ...portfolio, cash: 0 };
    await dbCreatePortfolio(newPortfolio);
    await refreshData();
    await setCurrentPortfolioId(newPortfolio.id);
  };

  const handleUpdatePortfolio = async (id: string, portfolio: Omit<Portfolio, "id">) => {
    const existing = portfolios.find(p => p.id === id);
    await dbUpdatePortfolio(id, { ...portfolio, cash: existing?.cash ?? 0 });
    await refreshData();
  };

  const handleDeletePortfolio = async (id: string) => {
    await dbDeletePortfolio(id);
    const remaining = await getPortfolios();
    await refreshData();
    if (currentPortfolioId === id) {
      if (remaining.length > 0) await setCurrentPortfolioId(remaining[0].id);
      else setCurrentPortfolioIdState(null);
    }
  };

  // ============================================================
  // DONNÉES COURANTES
  // ============================================================

  const currentData: PortfolioData = useMemo(() => {
    if (!currentPortfolioId) return { transactions: [], positions: [], closedPositions: [] };
    if (currentPortfolioId === "ALL") {
      const allTx: Transaction[] = [];
      const allPos: Position[] = [];
      const allClosed: ClosedPosition[] = [];
      portfolios.forEach(portfolio => {
        const data = portfolioData[portfolio.id];
        if (!data) return;
        const pid = portfolio.code || portfolio.name;
        const isEur = !portfolio.currency || portfolio.currency === "EUR";
        // rate = 1 EUR = ? portfolio_currency → pour convertir → EUR : diviser par rate
        const rate: number = (rates as Record<string, number>)[portfolio.currency] || 1;

        if (isEur) {
          // ── Portefeuille EUR : pas de conversion ────────────────
          data.transactions.forEach(t => {
            allTx.push({ ...t, portfolioCode: pid, portfolioId: portfolio.id } as any);
          });
          data.positions.forEach(p => {
            allPos.push({ ...p, portfolioCode: pid, portfolioId: portfolio.id });
          });
          data.closedPositions.forEach(cp => {
            allClosed.push({ ...cp, portfolioCode: pid });
          });
        } else {
          // ── Portefeuille non-EUR : replay des transactions pour taux historiques ──

          // 1. Transactions converties (historique + dépôts/retraits)
          data.transactions.forEach(t => {
            const toEur: number = t.portfolioToEurRate ?? (1 / rate);
            let convertedTx: Transaction;
            if (t.type === "depot" || t.type === "retrait" || t.type === "frais" || t.type === "interets") {
              convertedTx = { ...t, unitPrice: t.unitPrice * toEur };
            } else {
              convertedTx = {
                ...t,
                conversionRate: (t.conversionRate || 1) * toEur,
                fees: (t.fees || 0) * toEur,
                tff: (t.tff || 0) * toEur,
                ...(t.tax !== undefined ? { tax: t.tax * toEur } : {}),
              };
            }
            allTx.push({ ...convertedTx, portfolioCode: pid, portfolioId: portfolio.id } as any);
          });

          // 2. Replay achats/ventes → coût EUR par position et par cloture
          // eurCostMap : coût historique EUR des positions en cours
          // closedEurMap : valeurs EUR des positions clôturées (clé = CODE|saleDate)
          const eurCostMap = new Map<string, { totalCostEur: number; quantity: number }>();
          const closedEurMap = new Map<string, { pruEur: number; totalPurchaseEur: number; totalSaleEur: number; gainLossEur: number }>();

          [...data.transactions]
            .filter(t => t.type === "achat" || t.type === "vente")
            .sort((a, b) => {
              const diff = parseDate(a.date) - parseDate(b.date);
              if (diff !== 0) return diff;
              if (a.type === "achat" && b.type === "vente") return -1;
              if (a.type === "vente" && b.type === "achat") return 1;
              return 0;
            })
            .forEach(t => {
              const code = t.code.trim().toUpperCase();
              const toEur: number = t.portfolioToEurRate ?? (1 / rate);
              if (t.type === "achat") {
                const costInPort = t.quantity * t.unitPrice * (t.conversionRate || 1) + (t.fees || 0) + (t.tff || 0);
                const costEur = costInPort * toEur;
                const ex = eurCostMap.get(code);
                if (ex) { ex.totalCostEur += costEur; ex.quantity += t.quantity; }
                else eurCostMap.set(code, { totalCostEur: costEur, quantity: t.quantity });
              } else {
                const ex = eurCostMap.get(code);
                if (ex && ex.quantity >= t.quantity) {
                  const pruEur = ex.totalCostEur / ex.quantity;
                  const totalPurchaseEur = t.quantity * pruEur;
                  const saleInPort = t.quantity * t.unitPrice * (t.conversionRate || 1) - (t.fees || 0) - (t.tff || 0);
                  const totalSaleEur = saleInPort * toEur;
                  closedEurMap.set(`${code}|${t.date}`, {
                    pruEur,
                    totalPurchaseEur,
                    totalSaleEur,
                    gainLossEur: totalSaleEur - totalPurchaseEur,
                  });
                  ex.totalCostEur -= totalPurchaseEur;
                  ex.quantity -= t.quantity;
                  if (ex.quantity === 0) eurCostMap.delete(code);
                }
              }
            });

          // 3. Dividendes EUR par code (pour les positions clôturées)
          const dividendsByCode = new Map<string, Array<{ date: string; amountEur: number }>>();
          data.transactions
            .filter(t => t.type === "dividende")
            .forEach(t => {
              const code = t.code.trim().toUpperCase();
              const toEur: number = t.portfolioToEurRate ?? (1 / rate);
              const amountEur = (t.quantity * t.unitPrice * (t.conversionRate || 1) - ((t as any).tax || 0)) * toEur;
              if (!dividendsByCode.has(code)) dividendsByCode.set(code, []);
              dividendsByCode.get(code)!.push({ date: t.date, amountEur });
            });

          // 4. Positions en cours : PRU + totalCost en EUR historique
          //    Cours actuel et stop loss : taux du jour
          data.positions.forEach(p => {
            const code = p.code.trim().toUpperCase();
            const eurCost = eurCostMap.get(code);
            const totalCostEur = eurCost?.totalCostEur ?? (p.totalCost / rate);
            const pruEur = p.quantity > 0 ? totalCostEur / p.quantity : p.pru / rate;
            allPos.push({
              ...p,
              totalCost: totalCostEur,
              pru: pruEur,
              ...(p.stopLoss !== undefined ? { stopLoss: p.stopLoss / rate } : {}),
              portfolioCode: pid,
              portfolioId: portfolio.id,
            });
          });

          // 5. Positions clôturées : valeurs EUR historiques
          data.closedPositions.forEach(cp => {
            const code = cp.code.trim().toUpperCase();
            const eurVals = closedEurMap.get(`${code}|${cp.saleDate}`);
            const divs = dividendsByCode.get(code) ?? [];
            const purchaseTs = parseDate(cp.purchaseDate);
            const saleTs = parseDate(cp.saleDate);
            const dividendsEur = divs
              .filter(d => parseDate(d.date) >= purchaseTs && parseDate(d.date) <= saleTs)
              .reduce((sum, d) => sum + d.amountEur, 0);
            const convertedCp: ClosedPosition = eurVals ? {
              ...cp,
              pru: eurVals.pruEur,
              averageSalePrice: cp.quantity > 0 ? eurVals.totalSaleEur / cp.quantity : cp.averageSalePrice / rate,
              totalPurchase: eurVals.totalPurchaseEur,
              totalSale: eurVals.totalSaleEur,
              gainLoss: eurVals.gainLossEur,
              gainLossPercent: eurVals.totalPurchaseEur > 0 ? (eurVals.gainLossEur / eurVals.totalPurchaseEur) * 100 : cp.gainLossPercent,
              dividends: dividendsEur || (cp.dividends || 0) / rate,
            } : {
              ...cp,
              pru: cp.pru / rate,
              averageSalePrice: cp.averageSalePrice / rate,
              totalPurchase: cp.totalPurchase / rate,
              totalSale: cp.totalSale / rate,
              gainLoss: cp.gainLoss / rate,
              gainLossPercent: cp.gainLossPercent,
              dividends: dividendsEur || (cp.dividends || 0) / rate,
            };
            allClosed.push({ ...convertedCp, portfolioCode: pid });
          });
        }
      });
      return { transactions: allTx, positions: allPos, closedPositions: allClosed };
    }
    return portfolioData[currentPortfolioId] ?? { transactions: [], positions: [], closedPositions: [] };
  }, [currentPortfolioId, portfolioData, portfolios, rates]);

  const quoteSymbols = useMemo(
    () => Array.from(new Set(currentData.positions.map(p => (p.code || '').trim().toUpperCase()).filter(Boolean))),
    [currentData.positions]
  );
  const { quotesBySymbol, loading: quotesLoading, refresh: refreshQuotes } = useQuotes(quoteSymbols);

  const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  const handleAddTransaction = async (transaction: Omit<Transaction, "id">, portfolioId?: string) => {
    const targetId = portfolioId || currentPortfolioId;
    if (!targetId) return;

    const targetPortfolio = portfolios.find(p => p.id === targetId);
    const portCurrency = targetPortfolio?.currency || "EUR";
    const eurRate: number = portCurrency === "EUR" ? 1 : 1 / ((rates as Record<string, number>)[portCurrency] || 1);
    const newTx: DBTransaction = {
      ...transaction,
      id: crypto.randomUUID(),
      portfolioId: targetId,
      portfolioToEurRate: eurRate,
    };
    await dbAddTransaction(newTx);

    const targetData = portfolioData[targetId] ?? { transactions: [], positions: [], closedPositions: [] };
    const newTransactions = [...targetData.transactions, { ...transaction, id: newTx.id }];

    if (transaction.type === "achat") {
      await handlePurchase(newTx, targetData, targetId);
    } else if (transaction.type === "vente") {
      await handleSale(newTx, newTransactions, targetData, targetId);
    } else if (transaction.type === "dividende") {
      await handleDividend(newTx, targetId);
    }

    await refreshData();
  };

  const handlePurchase = async (tx: DBTransaction, targetData: PortfolioData, portfolioId: string) => {
    const txCode = (tx.code || "").trim().toUpperCase();
    const convertedUnitPrice = tx.unitPrice * (tx.conversionRate || 1);
    const totalCost = tx.quantity * convertedUnitPrice + (tx.fees || 0) + (tx.tff || 0);

    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (portfolio) await dbUpdatePortfolio(portfolioId, { cash: (portfolio.cash || 0) - totalCost });

    const existing = targetData.positions.find(p => (p.code || "").trim().toUpperCase() === txCode);
    if (existing) {
      const newTotalCost = existing.totalCost + totalCost;
      const newQuantity = existing.quantity + tx.quantity;
      // Targeted update : ne touche pas stop_loss ni manual_current_price (safe multi-devices)
      await updatePositionQuantityAndCost(portfolioId, tx.code, newQuantity, newTotalCost, newTotalCost / newQuantity);
    } else {
      await upsertPosition({ id: crypto.randomUUID(), portfolioId, code: tx.code, name: tx.name, quantity: tx.quantity, totalCost, pru: totalCost / tx.quantity, currency: tx.currency, sector: tx.sector });
    }
  };

  const handleSale = async (tx: DBTransaction, newTransactions: Transaction[], targetData: PortfolioData, portfolioId: string) => {
    const existing = targetData.positions.find(p => p.code === tx.code);
    if (!existing) { console.warn(`Vente ignorée : aucune position pour ${tx.code}`); return; }
    if (existing.quantity < tx.quantity) { alert("Erreur: Quantité insuffisante pour la vente"); return; }

    const convertedUnitPrice = tx.unitPrice * (tx.conversionRate || 1);
    const totalSale = tx.quantity * convertedUnitPrice - (tx.fees || 0) - (tx.tff || 0);
    const totalPurchase = tx.quantity * existing.pru;
    const gainLoss = totalSale - totalPurchase;

    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (portfolio) await dbUpdatePortfolio(portfolioId, { cash: (portfolio.cash || 0) + totalSale });

    const purchaseTx = newTransactions.filter(t => t.code === tx.code && t.type === "achat").sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];
    const purchaseDate = new Date(purchaseTx?.date || tx.date);
    const saleDate = new Date(tx.date);
    const dividends = newTransactions.filter(t => t.code === tx.code && t.type === "dividende" && new Date(t.date) >= purchaseDate && new Date(t.date) <= saleDate).reduce((sum, t) => sum + ((t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0)), 0);

    await addClosedPosition({ id: crypto.randomUUID(), portfolioId, code: tx.code, name: tx.name, purchaseDate: purchaseTx?.date || tx.date, saleDate: tx.date, quantity: tx.quantity, pru: existing.pru, averageSalePrice: totalSale / tx.quantity, totalPurchase, totalSale, gainLoss, gainLossPercent: (gainLoss / totalPurchase) * 100, dividends, sector: existing.sector });

    const newQuantity = existing.quantity - tx.quantity;
    if (newQuantity === 0) await dbDeletePosition(portfolioId, tx.code);
    // Targeted update : ne touche pas stop_loss ni manual_current_price (safe multi-devices)
    else await updatePositionQuantityAndCost(portfolioId, tx.code, newQuantity, existing.totalCost - totalPurchase, existing.pru);
  };

  const handleDividend = async (tx: DBTransaction, portfolioId: string) => {
    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (portfolio) {
      const dividendAmount = (tx.unitPrice * tx.quantity * (tx.conversionRate || 1)) - (tx.tax || 0);
      await dbUpdatePortfolio(portfolioId, { cash: (portfolio.cash || 0) + dividendAmount });
    }
  };

  const handleImportTransactions = async (transactions: Omit<Transaction, "id">[]): Promise<void> => {
    const targetPortfolioId = currentPortfolioId;
    if (!targetPortfolioId || targetPortfolioId === "ALL") {
      alert("Veuillez sélectionner un portefeuille spécifique avant d'importer.");
      return;
    }

    const [existingTxs, existingPos, existingClosed] = await Promise.all([
      getTransactions(targetPortfolioId),
      getPositions(targetPortfolioId),
      getClosedPositions(targetPortfolioId),
    ]);

    const allTx: DBTransaction[] = [...existingTxs];
    const positions: DBPosition[] = [...existingPos];
    const closedPositions: DBClosedPosition[] = [...existingClosed];

    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateDiff = parseDate(a.date) - parseDate(b.date);
      if (dateDiff !== 0) return dateDiff;
      if (a.type === "achat" && b.type === "vente") return -1;
      if (a.type === "vente" && b.type === "achat") return 1;
      return 0;
    });

    for (const tx of sortedTransactions) {
      const newTx: DBTransaction = { ...tx, id: crypto.randomUUID(), portfolioId: targetPortfolioId };
      allTx.push(newTx);
      const txCode = (tx.code || "").trim().toUpperCase();
      const convertedUnitPrice = tx.unitPrice * (tx.conversionRate || 1);

      if (tx.type === "achat") {
        const idx = positions.findIndex(p => (p.code || "").trim().toUpperCase() === txCode);
        const totalCost = tx.quantity * convertedUnitPrice + (tx.fees || 0) + (tx.tff || 0);
        if (idx >= 0) {
          const pos = positions[idx];
          const newTotalCost = pos.totalCost + totalCost;
          const newQuantity = pos.quantity + tx.quantity;
          positions[idx] = { ...pos, quantity: newQuantity, totalCost: newTotalCost, pru: newTotalCost / newQuantity, currency: tx.currency };
        } else {
          positions.push({ id: crypto.randomUUID(), portfolioId: targetPortfolioId, code: tx.code, name: tx.name, quantity: tx.quantity, totalCost, pru: totalCost / tx.quantity, currency: tx.currency, sector: tx.sector });
        }
      } else if (tx.type === "vente") {
        const idx = positions.findIndex(p => (p.code || "").trim().toUpperCase() === txCode);
        if (idx < 0) { console.warn(`Import: vente ignorée, aucune position pour ${txCode}`); continue; }
        const pos = positions[idx];
        if (pos.quantity < tx.quantity) { console.warn(`Import: quantité insuffisante pour ${txCode}`); continue; }
        const totalSale = tx.quantity * convertedUnitPrice - (tx.fees || 0) - (tx.tff || 0);
        const totalPurchase = tx.quantity * pos.pru;
        const gainLoss = totalSale - totalPurchase;
        const purchaseTx = allTx.filter(t => (t.code || "").trim().toUpperCase() === txCode && t.type === "achat").sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];
        closedPositions.push({ id: crypto.randomUUID(), portfolioId: targetPortfolioId, code: tx.code, name: tx.name, purchaseDate: purchaseTx?.date || tx.date, saleDate: tx.date, quantity: tx.quantity, pru: pos.pru, totalPurchase, totalSale, averageSalePrice: totalSale / tx.quantity, gainLoss, gainLossPercent: (gainLoss / totalPurchase) * 100, dividends: 0, sector: pos.sector });
        const newQuantity = pos.quantity - tx.quantity;
        if (newQuantity === 0) positions.splice(idx, 1);
        else positions[idx] = { ...pos, quantity: newQuantity, totalCost: pos.totalCost - totalPurchase };
      }
    }

    // Recalcul du cash depuis toutes les transactions (existantes + importées)

    await deleteTransactionsByPortfolio(targetPortfolioId);
    await deletePositionsByPortfolio(targetPortfolioId);
    await deleteClosedPositionsByPortfolio(targetPortfolioId);
    await bulkAddTransactions(allTx);
    await bulkUpsertPositions(positions);
    await bulkAddClosedPositions(closedPositions);
    await dbUpdatePortfolio(targetPortfolioId, { cash: newCash });
    await refreshData();
  };

  // ============================================================
  // DELETE TRANSACTION (recalcul complet positions + cash)
  // ============================================================

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm("Supprimer cette transaction ?")) return;
    if (!currentPortfolioId || currentPortfolioId === "ALL") return;

    await dbDeleteTransaction(id);
    const updatedTransactions = currentData.transactions.filter(t => t.id !== id);

    // Sauvegarder stop loss et cours manuels avant recalcul
    const stopLossMap = new Map<string, { stopLoss?: number; manualCurrentPrice?: number }>();
    (portfolioData[currentPortfolioId]?.positions ?? []).forEach(p => {
      stopLossMap.set((p.code || "").trim().toUpperCase(), { stopLoss: p.stopLoss, manualCurrentPrice: p.manualCurrentPrice });
    });

    const newPositions: DBPosition[] = [];
    const newClosedPositions: DBClosedPosition[] = [];

    updatedTransactions
      .filter(t => t.type === "achat" || t.type === "vente")
      .sort((a, b) => {
        const dateDiff = parseDate(a.date) - parseDate(b.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.type === "achat" && b.type === "vente") return -1;
        if (a.type === "vente" && b.type === "achat") return 1;
        return 0;
      })
      .forEach(transaction => {
        if (transaction.type === "achat") {
          const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
          const totalCost = transaction.quantity * convertedUnitPrice + (transaction.fees || 0) + (transaction.tff || 0);
          const existing = newPositions.find(p => p.code === transaction.code);
          if (existing) {
            const newTotalCost = existing.totalCost + totalCost;
            const newQuantity = existing.quantity + transaction.quantity;
            existing.quantity = newQuantity; existing.totalCost = newTotalCost; existing.pru = newTotalCost / newQuantity;
          } else {
            const saved = stopLossMap.get((transaction.code || "").trim().toUpperCase());
            newPositions.push({ id: crypto.randomUUID(), portfolioId: currentPortfolioId, code: transaction.code, name: transaction.name, quantity: transaction.quantity, totalCost, pru: totalCost / transaction.quantity, currency: transaction.currency, sector: transaction.sector, ...saved });
          }
        } else if (transaction.type === "vente") {
          const existing = newPositions.find(p => p.code === transaction.code);
          if (existing && existing.quantity >= transaction.quantity) {
            const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
            const totalSale = transaction.quantity * convertedUnitPrice - (transaction.fees || 0) - (transaction.tff || 0);
            const totalPurchase = transaction.quantity * existing.pru;
            const gainLoss = totalSale - totalPurchase;
            const purchaseTx = updatedTransactions.filter(t => t.code === transaction.code && t.type === "achat").sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];
            const purchaseDate = new Date(purchaseTx?.date || transaction.date);
            const saleDate = new Date(transaction.date);
            const dividends = updatedTransactions.filter(t => t.code === transaction.code && t.type === "dividende" && new Date(t.date) >= purchaseDate && new Date(t.date) <= saleDate).reduce((sum, t) => sum + ((t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0)), 0);
            newClosedPositions.push({ id: crypto.randomUUID(), portfolioId: currentPortfolioId, code: transaction.code, name: transaction.name, purchaseDate: purchaseTx?.date || transaction.date, saleDate: transaction.date, quantity: transaction.quantity, pru: existing.pru, averageSalePrice: totalSale / transaction.quantity, totalPurchase, totalSale, gainLoss, gainLossPercent: (gainLoss / totalPurchase) * 100, dividends, sector: existing.sector });
            const newQuantity = existing.quantity - transaction.quantity;
            if (newQuantity === 0) newPositions.splice(newPositions.indexOf(existing), 1);
            else { existing.quantity = newQuantity; existing.totalCost -= totalPurchase; }
          }
        }
      });

    try {
      const newCash = recalcCash(updatedTransactions);
      await deletePositionsByPortfolio(currentPortfolioId);
      await deleteClosedPositionsByPortfolio(currentPortfolioId);
      await bulkUpsertPositions(newPositions);
      await bulkAddClosedPositions(newClosedPositions);
      await dbUpdatePortfolio(currentPortfolioId, { cash: newCash });
    } catch (err) {
      console.error('Erreur recalcul positions après suppression:', err);
    } finally {
      await refreshData();
    }
  };

  // ============================================================
  // EDIT TRANSACTION (recalcul complet positions + cash)
  // ============================================================

  const handleEditTransaction = async (updated: Transaction) => {
    const effectivePortfolioId = (updated as any).portfolioId || currentPortfolioId;
    if (!effectivePortfolioId || effectivePortfolioId === "ALL") return;

    // Trouver le portefeuille d'origine de la transaction
    const originalPortfolioId = Object.entries(portfolioData).find(
      ([, d]) => d.transactions.some(t => t.id === updated.id)
    )?.[0];

    const portfolioChanged = originalPortfolioId && originalPortfolioId !== effectivePortfolioId;

    // Mise à jour Supabase (champs + portfolio_id si changé)
    const patch: Record<string, any> = {
      date: updated.date,
      code: updated.code?.toUpperCase(),
      name: updated.name,
      type: updated.type,
      quantity: Number(updated.quantity) || 0,
      unit_price: Number(updated.unitPrice) || 0,
      fees: Number(updated.fees) || 0,
      tff: Number(updated.tff) || 0,
      currency: updated.currency,
      conversion_rate: Number(updated.conversionRate) || 1,
      tax: updated.type === "dividende" ? ((updated as any).tax ?? null) : null,
      sector: (updated as any).sector ?? null,
    };
    if (portfolioChanged) patch.portfolio_id = effectivePortfolioId;

    await supabase.from("transactions").update(patch).eq("id", updated.id);

    // Si le portefeuille a changé, recalculer les positions des deux portefeuilles
    if (portfolioChanged && originalPortfolioId) {
      // Sauvegarder stop loss des deux portefeuilles
      const origStopLossMap = new Map<string, { stopLoss?: number; manualCurrentPrice?: number }>();
      (portfolioData[originalPortfolioId]?.positions ?? []).forEach(p => {
        origStopLossMap.set((p.code || "").trim().toUpperCase(), { stopLoss: p.stopLoss, manualCurrentPrice: p.manualCurrentPrice });
      });
      const newPortStopLossMap = new Map<string, { stopLoss?: number; manualCurrentPrice?: number }>();
      (portfolioData[effectivePortfolioId]?.positions ?? []).forEach(p => {
        newPortStopLossMap.set((p.code || "").trim().toUpperCase(), { stopLoss: p.stopLoss, manualCurrentPrice: p.manualCurrentPrice });
      });

      // 1. Recalc portefeuille d'origine (sans la transaction déplacée)
      const origTxs = (portfolioData[originalPortfolioId]?.transactions ?? []).filter(t => t.id !== updated.id);
      const origPositions: DBPosition[] = [];
      const origClosed: DBClosedPosition[] = [];
      origTxs.filter(t => t.type === "achat" || t.type === "vente").sort((a, b) => parseDate(a.date) - parseDate(b.date)).forEach(t => {
        if (t.type === "achat") {
          const cost = t.quantity * t.unitPrice * t.conversionRate + (t.fees || 0) + (t.tff || 0);
          const ex = origPositions.find(p => p.code === t.code);
          if (ex) { ex.totalCost += cost; ex.quantity += t.quantity; ex.pru = ex.totalCost / ex.quantity; }
          else { const saved = origStopLossMap.get((t.code || "").trim().toUpperCase()); origPositions.push({ id: crypto.randomUUID(), portfolioId: originalPortfolioId, code: t.code, name: t.name, quantity: t.quantity, totalCost: cost, pru: cost / t.quantity, currency: t.currency, sector: t.sector, ...saved }); }
        } else if (t.type === "vente") {
          const ex = origPositions.find(p => p.code === t.code);
          if (ex && ex.quantity >= t.quantity) {
            const sale = t.quantity * t.unitPrice * t.conversionRate - (t.fees || 0);
            const purchase = t.quantity * ex.pru;
            const gainLoss = sale - purchase;
            origClosed.push({ id: crypto.randomUUID(), portfolioId: originalPortfolioId, code: t.code, name: t.name, purchaseDate: t.date, saleDate: t.date, quantity: t.quantity, pru: ex.pru, averageSalePrice: sale / t.quantity, totalPurchase: purchase, totalSale: sale, gainLoss, gainLossPercent: (gainLoss / purchase) * 100, dividends: 0, sector: ex.sector });
            const remaining = ex.quantity - t.quantity;
            if (remaining === 0) origPositions.splice(origPositions.indexOf(ex), 1);
            else { ex.quantity = remaining; ex.totalCost -= purchase; }
          }
        }
      });
      await deletePositionsByPortfolio(originalPortfolioId);
      await deleteClosedPositionsByPortfolio(originalPortfolioId);
      await bulkUpsertPositions(origPositions);
      await bulkAddClosedPositions(origClosed);
      await dbUpdatePortfolio(originalPortfolioId, { cash: recalcCash(origTxs) });

      // 2. Recalc nouveau portefeuille (transactions existantes + transaction déplacée)
      const newPortfolioTxs = [...(portfolioData[effectivePortfolioId]?.transactions ?? []), updated];
      const newPortfolioPositions: DBPosition[] = [];
      const newPortfolioClosed: DBClosedPosition[] = [];
      newPortfolioTxs.filter(t => t.type === "achat" || t.type === "vente").sort((a, b) => {
        const dateDiff = parseDate(a.date) - parseDate(b.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.type === "achat" && b.type === "vente") return -1;
        if (a.type === "vente" && b.type === "achat") return 1;
        return 0;
      }).forEach(t => {
        if (t.type === "achat") {
          const cost = t.quantity * t.unitPrice * t.conversionRate + (t.fees || 0) + (t.tff || 0);
          const ex = newPortfolioPositions.find(p => p.code === t.code);
          if (ex) { ex.totalCost += cost; ex.quantity += t.quantity; ex.pru = ex.totalCost / ex.quantity; }
          else { const saved = newPortStopLossMap.get((t.code || "").trim().toUpperCase()); newPortfolioPositions.push({ id: crypto.randomUUID(), portfolioId: effectivePortfolioId, code: t.code, name: t.name, quantity: t.quantity, totalCost: cost, pru: cost / t.quantity, currency: t.currency, sector: t.sector, ...saved }); }
        } else if (t.type === "vente") {
          const ex = newPortfolioPositions.find(p => p.code === t.code);
          if (ex && ex.quantity >= t.quantity) {
            const sale = t.quantity * t.unitPrice * t.conversionRate - (t.fees || 0);
            const purchase = t.quantity * ex.pru;
            const gainLoss = sale - purchase;
            const purchaseTx = newPortfolioTxs.filter(tx => tx.code === t.code && tx.type === "achat").sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];
            const dividends = newPortfolioTxs.filter(tx => tx.code === t.code && tx.type === "dividende").reduce((sum, tx) => sum + (tx.unitPrice * tx.quantity * tx.conversionRate - (tx.tax || 0)), 0);
            newPortfolioClosed.push({ id: crypto.randomUUID(), portfolioId: effectivePortfolioId, code: t.code, name: t.name, purchaseDate: purchaseTx?.date || t.date, saleDate: t.date, quantity: t.quantity, pru: ex.pru, averageSalePrice: sale / t.quantity, totalPurchase: purchase, totalSale: sale, gainLoss, gainLossPercent: (gainLoss / purchase) * 100, dividends, sector: ex.sector });
            const remaining = ex.quantity - t.quantity;
            if (remaining === 0) newPortfolioPositions.splice(newPortfolioPositions.indexOf(ex), 1);
            else { ex.quantity = remaining; ex.totalCost -= purchase; }
          }
        }
      });
      await deletePositionsByPortfolio(effectivePortfolioId);
      await deleteClosedPositionsByPortfolio(effectivePortfolioId);
      await bulkUpsertPositions(newPortfolioPositions);
      await bulkAddClosedPositions(newPortfolioClosed);
      await dbUpdatePortfolio(effectivePortfolioId, { cash: recalcCash(newPortfolioTxs) });

      await refreshData();
      return;
    }

    const portfolioTransactions = portfolioData[effectivePortfolioId]?.transactions ?? [];
    const updatedTransactions = portfolioTransactions.map(t =>
      t.id === updated.id ? updated : t
    );

    // Sauvegarder stop loss et cours manuels avant recalcul
    const stopLossMap = new Map<string, { stopLoss?: number; manualCurrentPrice?: number }>();
    (portfolioData[effectivePortfolioId]?.positions ?? []).forEach(p => {
      stopLossMap.set((p.code || "").trim().toUpperCase(), { stopLoss: p.stopLoss, manualCurrentPrice: p.manualCurrentPrice });
    });

    const newPositions: DBPosition[] = [];
    const newClosedPositions: DBClosedPosition[] = [];

    updatedTransactions
      .filter(t => t.type === "achat" || t.type === "vente")
      .sort((a, b) => {
        const dateDiff = parseDate(a.date) - parseDate(b.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.type === "achat" && b.type === "vente") return -1;
        if (a.type === "vente" && b.type === "achat") return 1;
        return 0;
      })
      .forEach(transaction => {
        if (transaction.type === "achat") {
          const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
          const totalCost = transaction.quantity * convertedUnitPrice + (transaction.fees || 0) + (transaction.tff || 0);
          const existing = newPositions.find(p => p.code === transaction.code);
          if (existing) {
            const newTotalCost = existing.totalCost + totalCost;
            const newQuantity = existing.quantity + transaction.quantity;
            existing.quantity = newQuantity; existing.totalCost = newTotalCost; existing.pru = newTotalCost / newQuantity;
          } else {
            const saved = stopLossMap.get((transaction.code || "").trim().toUpperCase());
            newPositions.push({ id: crypto.randomUUID(), portfolioId: effectivePortfolioId, code: transaction.code, name: transaction.name, quantity: transaction.quantity, totalCost, pru: totalCost / transaction.quantity, currency: transaction.currency, sector: transaction.sector, ...saved });
          }
        } else if (transaction.type === "vente") {
          const existing = newPositions.find(p => p.code === transaction.code);
          if (existing && existing.quantity >= transaction.quantity) {
            const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
            const totalSale = transaction.quantity * convertedUnitPrice - (transaction.fees || 0) - (transaction.tff || 0);
            const totalPurchase = transaction.quantity * existing.pru;
            const gainLoss = totalSale - totalPurchase;
            const purchaseTx = updatedTransactions.filter(t => t.code === transaction.code && t.type === "achat").sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];
            const purchaseDate = new Date(purchaseTx?.date || transaction.date);
            const saleDate = new Date(transaction.date);
            const dividends = updatedTransactions.filter(t => t.code === transaction.code && t.type === "dividende" && new Date(t.date) >= purchaseDate && new Date(t.date) <= saleDate).reduce((sum, t) => sum + ((t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0)), 0);
            newClosedPositions.push({ id: crypto.randomUUID(), portfolioId: effectivePortfolioId, code: transaction.code, name: transaction.name, purchaseDate: purchaseTx?.date || transaction.date, saleDate: transaction.date, quantity: transaction.quantity, pru: existing.pru, averageSalePrice: totalSale / transaction.quantity, totalPurchase, totalSale, gainLoss, gainLossPercent: (gainLoss / totalPurchase) * 100, dividends, sector: existing.sector });
            const newQuantity = existing.quantity - transaction.quantity;
            if (newQuantity === 0) newPositions.splice(newPositions.indexOf(existing), 1);
            else { existing.quantity = newQuantity; existing.totalCost -= totalPurchase; }
          }
        }
      });

    try {
      const newCash = recalcCash(updatedTransactions);
      await deletePositionsByPortfolio(effectivePortfolioId);
      await deleteClosedPositionsByPortfolio(effectivePortfolioId);
      await bulkUpsertPositions(newPositions);
      await bulkAddClosedPositions(newClosedPositions);
      await dbUpdatePortfolio(effectivePortfolioId, { cash: newCash });
    } catch (err) {
      console.error('Erreur recalcul positions après édition:', err);
    } finally {
      await refreshData();
    }
  };

  // ============================================================
  // ACTIONS POSITIONS
  // ============================================================

const handlePositionAction = (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => {
  if (action === 'dividende') {
    setDividendDialogInitialData({
      code: position.code,
      name: position.name,
      type: 'dividende',
      quantity: position.quantity,
      portfolioId,
    });
    setDividendDialogOpen(true);
  } else {
    setDialogInitialData({
      code: position.code,
      name: position.name,
      type: action,
      quantity: action === 'vente' ? position.quantity : undefined,
      portfolioId,
    });
    setDialogOpen(true);
  }
};

  const handleUpdateCash = async (amount: number, type: "deposit" | "withdrawal" | "fees" | "interests", date: string) => {
    if (!currentPortfolioId || !currentPortfolio) return;
    const increases = type === "deposit" || type === "interests";
    const newCash = increases
      ? (currentPortfolio.cash || 0) + amount
      : (currentPortfolio.cash || 0) - amount;
    const portCurrencyCash = currentPortfolio.currency || "EUR";
    const eurRateCash: number = portCurrencyCash === "EUR" ? 1 : 1 / ((rates as Record<string, number>)[portCurrencyCash] || 1);
    const TX_NAMES = { deposit: "Dépôt de liquidités", withdrawal: "Retrait de liquidités", fees: "Frais", interests: "Intérêts" };
    const TX_TYPES = { deposit: "depot", withdrawal: "retrait", fees: "frais", interests: "interets" } as const;
    const newTransaction: DBTransaction = {
      id: crypto.randomUUID(),
      portfolioId: currentPortfolioId,
      date,
      code: "CASH",
      name: TX_NAMES[type],
      type: TX_TYPES[type],
      quantity: 1,
      unitPrice: amount,
      fees: 0,
      tff: 0,
      currency: currentPortfolio.currency,
      conversionRate: 1,
      portfolioToEurRate: eurRateCash,
    };
    await dbUpdatePortfolio(currentPortfolioId, { cash: newCash });
    await dbAddTransaction(newTransaction);
    await refreshData();
  };

  const handleUpdateStopLoss = async (code: string, stopLoss: number | undefined) => {
    if (!currentPortfolioId) return;
    const portfolioIds = currentPortfolioId === "ALL" ? portfolios.map(p => p.id) : [currentPortfolioId];
    const errors: string[] = [];
    for (const pid of portfolioIds) {
      const pos = portfolioData[pid]?.positions.find(p => p.code === code);
      if (pos) {
        try {
          await updatePositionStopLoss(pid, code, stopLoss);
        } catch (e: any) {
          errors.push(String(e?.message ?? e));
        }
      }
    }
    if (errors.length > 0) {
      console.error("Erreur sauvegarde stop loss:", errors);
      alert("Erreur lors de la sauvegarde du stop loss : " + errors[0]);
      return;
    }
    await refreshData();
  };

  const handleUpdateCurrentPrice = async (code: string, manualCurrentPrice: number | undefined) => {
    if (!currentPortfolioId) return;
    const portfolioIds = currentPortfolioId === "ALL" ? portfolios.map(p => p.id) : [currentPortfolioId];
    const errors: string[] = [];
    for (const pid of portfolioIds) {
      const pos = portfolioData[pid]?.positions.find(p => p.code === code);
      if (pos) {
        try {
          await updatePositionManualPrice(pid, code, manualCurrentPrice);
        } catch (e: any) {
          errors.push(String(e?.message ?? e));
        }
      }
    }
    if (errors.length > 0) {
      console.error("Erreur sauvegarde cours manuel:", errors);
      return;
    }
    await refreshData();
  };

  // Recalcule le cash depuis Supabase pour un portefeuille donné
const recalcCashFromDB = async (portfolioId: string) => {
  const txs = await getTransactions(portfolioId);
  console.log("nb txs:", txs.length);
  console.log("première tx:", txs[0]);
  const newCash = txs.reduce((cash, t) => {
    const converted = t.unitPrice * (t.conversionRate || 1);
    switch (t.type) {
      case "depot":     return cash + t.unitPrice;
      case "retrait":   return cash - t.unitPrice;
      case "frais":     return cash - t.unitPrice;
      case "interets":  return cash + t.unitPrice;
      case "achat":     return cash - (t.quantity * converted + (t.fees || 0) + (t.tff || 0));
      case "vente":     return cash + (t.quantity * converted - (t.fees || 0) - (t.tff || 0));
      case "dividende": return cash + (t.quantity * converted - ((t as any).tax || 0));
      default:          return cash;
    }
  }, 0);
  console.log("newCash calculé:", newCash);
  await dbUpdatePortfolio(portfolioId, { cash: newCash });
};

  // ============================================================
  // CONTEXT
  // ============================================================

  const contextValue: PortfolioContextType = {
    portfolios,
    currentPortfolioId,
    currentPortfolio,
    currentData,
    handleCreatePortfolio,
    handleUpdatePortfolio,
    handleDeletePortfolio,
    handleEditTransaction,
    setCurrentPortfolioId,
    handleAddTransaction,
    handleImportTransactions,
    handleDeleteTransaction,
    handlePositionAction,
    handleUpdateCash,
    handleUpdateStopLoss,
    handleUpdateCurrentPrice,
    dialogOpen,
    setDialogOpen,
    dialogInitialData,
    setDialogInitialData,
    refreshData,
    recalcCashFromDB,
    totalPortfolio,
    setTotalPortfolio,
    quotesBySymbol,
    refreshQuotes,
    quotesLoading,
  };

  const backfillPortfolioToEurRates = async () => {
    setBackfillLoading(true);
    setBackfillProgress("Chargement des transactions...");

    const normalizeDate = (d: string): string => {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
        const [day, month, year] = d.split('/');
        return `${year}-${month}-${day}`;
      }
      return d.split('T')[0];
    };

    try {
      // Récupérer toutes les transactions sans taux EUR
      const { data: rows, error } = await supabase
        .from('transactions')
        .select('id, portfolio_id, date')
        .is('portfolio_to_eur_rate', null);
      if (error) throw error;
      if (!rows || rows.length === 0) {
        setBackfillProgress("✅ Toutes les transactions ont déjà un taux EUR.");
        setTimeout(() => setBackfillProgress(null), 4000);
        setBackfillLoading(false);
        return;
      }

      const portfolioCurrencyMap: Record<string, string> = {};
      portfolios.forEach(p => { portfolioCurrencyMap[p.id] = p.currency || "EUR"; });

      const eurRows = rows.filter(r => (portfolioCurrencyMap[r.portfolio_id] || "EUR") === "EUR");
      const nonEurRows = rows.filter(r => (portfolioCurrencyMap[r.portfolio_id] || "EUR") !== "EUR");

      setBackfillProgress(`${rows.length} transaction(s) à traiter (${nonEurRows.length} en devise étrangère)...`);

      // ── Récupération des taux historiques (Frankfurter / BCE) ────
      const uniquePairs = new Set<string>();
      nonEurRows.forEach(r => {
        const cur = portfolioCurrencyMap[r.portfolio_id] || "EUR";
        uniquePairs.add(`${normalizeDate(r.date)}|${cur}`);
      });

      const rateCache: Record<string, number> = {};
      const pairs = Array.from(uniquePairs);
      let fetched = 0;
      for (const pair of pairs) {
        const [date, currency] = pair.split('|');
        setBackfillProgress(`Taux historiques : ${++fetched}/${pairs.length} (${currency} du ${date})`);
        try {
          const apiCurrency = currency === "GBX" ? "GBP" : currency;
          const resp = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=${apiCurrency}`);
          if (resp.ok) {
            const data = await resp.json();
            const eurToApi: number = data.rates?.[apiCurrency];
            if (eurToApi && eurToApi > 0) {
              let toEur = 1 / eurToApi;
              if (currency === "GBX") toEur = toEur / 100; // 1 GBX = 1/100 GBP
              rateCache[pair] = toEur;
            }
          }
        } catch { /* on garde null pour cette paire */ }
        await new Promise(res => setTimeout(res, 80)); // éviter le rate-limiting
      }

      // ── Mise à jour en base ──────────────────────────────────────
      setBackfillProgress("Mise à jour en base de données...");
      const BATCH = 100;

      // Portefeuilles EUR : rate = 1
      const eurIds = eurRows.map(r => r.id);
      for (let i = 0; i < eurIds.length; i += BATCH) {
        await supabase.from('transactions')
          .update({ portfolio_to_eur_rate: 1 })
          .in('id', eurIds.slice(i, i + BATCH));
      }

      // Portefeuilles non-EUR : regrouper par taux pour minimiser les requêtes
      const rateToIds: Record<string, string[]> = {};
      for (const row of nonEurRows) {
        const cur = portfolioCurrencyMap[row.portfolio_id] || "EUR";
        const key = `${normalizeDate(row.date)}|${cur}`;
        const toEur = rateCache[key];
        if (toEur !== undefined) {
          const rateKey = String(toEur);
          if (!rateToIds[rateKey]) rateToIds[rateKey] = [];
          rateToIds[rateKey].push(row.id);
        }
      }
      for (const [rateStr, ids] of Object.entries(rateToIds)) {
        const rate = parseFloat(rateStr);
        for (let i = 0; i < ids.length; i += BATCH) {
          await supabase.from('transactions')
            .update({ portfolio_to_eur_rate: rate })
            .in('id', ids.slice(i, i + BATCH));
        }
      }

      const missing = nonEurRows.length - Object.values(rateToIds).flat().length;
      const msg = missing > 0
        ? `✅ Terminé. ${missing} transaction(s) sans taux disponible (devise non supportée ou date trop ancienne).`
        : "✅ Terminé. Tous les taux ont été mis à jour.";
      setBackfillProgress(msg);
      await refreshData();
      setTimeout(() => setBackfillProgress(null), 6000);
    } catch (err: any) {
      setBackfillProgress("❌ Erreur : " + (err?.message ?? String(err)));
      setTimeout(() => setBackfillProgress(null), 6000);
    } finally {
      setBackfillLoading(false);
    }
  };

  const [recalcPRULoading, setRecalcPRULoading] = useState(false);
  const [recalcPRUProgress, setRecalcPRUProgress] = useState<string | null>(null);

  const handleBackfillHistory = async () => {
    if (quoteSymbols.length === 0) { alert("Aucun symbole à récupérer."); return; }
    setBackfillLoading(true);
    setBackfillProgress(`0 / ${quoteSymbols.length}`);
    try {
      const { saved, failed } = await backfillHistoricalPrices(
        quoteSymbols,
        (done, total, symbol) => setBackfillProgress(symbol ? `${done + 1} / ${total} — ${symbol}` : `${total} / ${total}`)
      );
      setBackfillProgress(`✓ ${saved} cours sauvegardés${failed.length ? ` (${failed.length} échecs)` : ""}`);
    } catch (e: any) {
      setBackfillProgress(`Erreur : ${e?.message}`);
    } finally {
      setBackfillLoading(false);
      setTimeout(() => setBackfillProgress(null), 4000);
    }
  };

  const recalcPRU = async () => {
    if (!currentPortfolioId || currentPortfolioId === "ALL") {
      alert("Sélectionnez un portefeuille spécifique pour recalculer les PRU.");
      return;
    }
    if (!confirm("Recalculer les PRU, positions et liquidités depuis l'historique des transactions ?\n\nLes stop loss et cours manuels seront préservés.")) return;

    setRecalcPRULoading(true);
    setRecalcPRUProgress("Chargement des transactions depuis la base...");

    try {
      // Lecture fraîche depuis Supabase
      const [txs, existingPos] = await Promise.all([
        getTransactions(currentPortfolioId),
        getPositions(currentPortfolioId),
      ]);

      setRecalcPRUProgress(`${txs.length} transaction(s) trouvée(s) — recalcul en cours...`);

      // Préserver stop loss et cours manuels
      const stopLossMap = new Map<string, { stopLoss?: number; manualCurrentPrice?: number }>();
      existingPos.forEach(p => {
        stopLossMap.set((p.code || "").trim().toUpperCase(), {
          stopLoss: p.stopLoss,
          manualCurrentPrice: p.manualCurrentPrice,
        });
      });

      // Replay des transactions pour reconstruire positions et positions clôturées
      const newPositions: DBPosition[] = [];
      const newClosedPositions: DBClosedPosition[] = [];

      const sortedTxs = [...txs]
        .filter(t => t.type === "achat" || t.type === "vente")
        .sort((a, b) => {
          const diff = parseDate(a.date) - parseDate(b.date);
          if (diff !== 0) return diff;
          if (a.type === "achat" && b.type === "vente") return -1;
          if (a.type === "vente" && b.type === "achat") return 1;
          return 0;
        });

      for (const t of sortedTxs) {
        const code = (t.code || "").trim().toUpperCase();
        const convertedPrice = t.unitPrice * (t.conversionRate || 1);

        if (t.type === "achat") {
          const totalCost = t.quantity * convertedPrice + (t.fees || 0) + (t.tff || 0);
          const existing = newPositions.find(p => (p.code || "").trim().toUpperCase() === code);
          if (existing) {
            const newTotalCost = existing.totalCost + totalCost;
            const newQty = existing.quantity + t.quantity;
            existing.totalCost = newTotalCost;
            existing.quantity = newQty;
            existing.pru = newTotalCost / newQty;
          } else {
            const saved = stopLossMap.get(code);
            newPositions.push({
              id: crypto.randomUUID(),
              portfolioId: currentPortfolioId,
              code: t.code,
              name: t.name,
              quantity: t.quantity,
              totalCost,
              pru: totalCost / t.quantity,
              currency: t.currency,
              sector: t.sector,
              ...saved,
            });
          }
        } else if (t.type === "vente") {
          const existing = newPositions.find(p => (p.code || "").trim().toUpperCase() === code);
          if (!existing || existing.quantity < t.quantity) {
            console.warn(`RecalcPRU: vente ignorée (position insuffisante) pour ${t.code}`);
            continue;
          }
          const totalSale = t.quantity * convertedPrice - (t.fees || 0) - (t.tff || 0);
          const totalPurchase = t.quantity * existing.pru;
          const gainLoss = totalSale - totalPurchase;

          const purchaseTx = txs.filter(tx => tx.code === t.code && tx.type === "achat")
            .sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];
          const purchaseDate = new Date(purchaseTx?.date || t.date);
          const saleDate = new Date(t.date);
          const dividends = txs
            .filter(tx => tx.code === t.code && tx.type === "dividende"
              && new Date(tx.date) >= purchaseDate && new Date(tx.date) <= saleDate)
            .reduce((sum, tx) => sum + (tx.unitPrice * tx.quantity * (tx.conversionRate || 1) - ((tx as any).tax || 0)), 0);

          newClosedPositions.push({
            id: crypto.randomUUID(),
            portfolioId: currentPortfolioId,
            code: t.code,
            name: t.name,
            purchaseDate: purchaseTx?.date || t.date,
            saleDate: t.date,
            quantity: t.quantity,
            pru: existing.pru,
            averageSalePrice: totalSale / t.quantity,
            totalPurchase,
            totalSale,
            gainLoss,
            gainLossPercent: totalPurchase > 0 ? (gainLoss / totalPurchase) * 100 : 0,
            dividends,
            sector: existing.sector,
          });

          const newQty = existing.quantity - t.quantity;
          if (newQty === 0) newPositions.splice(newPositions.indexOf(existing), 1);
          else { existing.quantity = newQty; existing.totalCost -= totalPurchase; }
        }
      }

      // Recalcul du cash
      const newCash = txs.reduce((cash, t) => {
        const converted = t.unitPrice * (t.conversionRate || 1);
        switch (t.type) {
          case "depot":     return cash + t.unitPrice;
          case "retrait":   return cash - t.unitPrice;
          case "frais":     return cash - t.unitPrice;
          case "interets":  return cash + t.unitPrice;
          case "achat":     return cash - (t.quantity * converted + (t.fees || 0) + (t.tff || 0));
          case "vente":     return cash + (t.quantity * converted - (t.fees || 0) - (t.tff || 0));
          case "dividende": return cash + (t.quantity * converted - ((t as any).tax || 0));
          default:          return cash;
        }
      }, 0);

      setRecalcPRUProgress("Mise à jour en base de données...");
      await deletePositionsByPortfolio(currentPortfolioId);
      await deleteClosedPositionsByPortfolio(currentPortfolioId);
      await bulkUpsertPositions(newPositions);
      await bulkAddClosedPositions(newClosedPositions);
      await dbUpdatePortfolio(currentPortfolioId, { cash: newCash });

      setRecalcPRUProgress(`✅ Terminé — ${newPositions.length} position(s) en cours, ${newClosedPositions.length} position(s) clôturée(s) recalculées.`);
      await refreshData();
      setTimeout(() => setRecalcPRUProgress(null), 6000);
    } catch (err: any) {
      setRecalcPRUProgress("❌ Erreur : " + (err?.message ?? String(err)));
      setTimeout(() => setRecalcPRUProgress(null), 6000);
    } finally {
      setRecalcPRULoading(false);
    }
  };

  const handleRecalcCash = async () => {
    if (!currentPortfolioId || currentPortfolioId === "ALL") {
      alert("Sélectionnez un portefeuille spécifique pour recalculer les liquidités.");
      return;
    }
    setRecalcLoading(true);
    try {
      await recalcCashFromDB(currentPortfolioId);
      await refreshData();
      alert("✅ Liquidités recalculées.");
    } catch {
      alert("❌ Erreur lors du recalcul.");
    } finally {
      setRecalcLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Chargement de vos données...</p>
        </div>
      </div>
    );
  }

  return (
    <PortfolioContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background p-3 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="size-6 sm:size-8 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl md:text-3xl leading-tight">Suivi de Portefeuille Boursier</h1>
          </div>

          <PortfolioSelector
            portfolios={portfolios}
            currentPortfolioId={currentPortfolioId}
            onCreatePortfolio={handleCreatePortfolio}
            onUpdatePortfolio={handleUpdatePortfolio}
            onDeletePortfolio={handleDeletePortfolio}
            onSelectPortfolio={setCurrentPortfolioId}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div className="flex flex-wrap gap-1 sm:gap-2">
              <Link to="/"><Button variant={location.pathname === "/" ? "default" : "ghost"} size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm"><LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="hidden xs:inline">Tableau de bord</span><span className="xs:hidden">Bord</span></Button></Link>
              <Link to="/transactions"><Button variant={location.pathname === "/transactions" ? "default" : "ghost"} size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Transactions</Button></Link>
              <Link to="/calculator"><Button variant={location.pathname === "/calculator" ? "default" : "ghost"} size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Calculatrice</span><span className="sm:hidden">Calc.</span></Button></Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" title="Actions"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={exportDatabase} className="gap-2"><Download className="h-4 w-4" />Exporter</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" />Importer un fichier…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEnableAutoBackup} className="gap-2"><HardDrive className="h-4 w-4" />Activer sauvegarde automatique</DropdownMenuItem>
                  <DropdownMenuItem onClick={onDisableAutoBackup} className="gap-2"><PauseCircle className="h-4 w-4" />Désactiver sauvegarde automatique</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => refreshQuotes()}
                    disabled={quotesLoading || quoteSymbols.length === 0}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${quotesLoading ? "animate-spin" : ""}`} />
                    {quotesLoading ? "Actualisation des cours…" : "Actualiser les cours"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleBackfillHistory}
                    disabled={backfillLoading || quoteSymbols.length === 0}
                    className="gap-2"
                  >
                    <History className={`h-4 w-4 ${backfillLoading ? "animate-spin" : ""}`} />
                    {backfillLoading ? `Historique… ${backfillProgress ?? ""}` : "Récupérer l'historique des cours"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleRecalcCash}
                    disabled={recalcLoading || !currentPortfolioId || currentPortfolioId === "ALL"}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${recalcLoading ? "animate-spin" : ""}`} />
                    Recalculer les liquidités
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={backfillPortfolioToEurRates}
                    disabled={backfillLoading}
                    className="gap-2"
                  >
                    <Globe className={`h-4 w-4 ${backfillLoading ? "animate-spin" : ""}`} />
                    {backfillLoading ? "Mise à jour taux EUR…" : "Backfill taux EUR historiques"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={recalcPRU}
                    disabled={recalcPRULoading || !currentPortfolioId || currentPortfolioId === "ALL"}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${recalcPRULoading ? "animate-spin" : ""}`} />
                    {recalcPRULoading ? "Recalcul PRU…" : "Recalculer les PRU"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setImportTxOpen(true)} className="gap-2"><Upload className="h-4 w-4" />Importer des transactions</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleResetDatabase} className="gap-2 text-destructive focus:text-destructive"><RotateCcw className="h-4 w-4" />Réinitialiser…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {autoBackupNeedsPermission && (
                <Button variant="outline" size="sm" onClick={onReauthorizeAutoBackup} className="gap-2"><HardDrive className="h-4 w-4" />Réactiver</Button>
              )}

              <button
                onClick={autoBackupEnabled ? onDisableAutoBackup : onEnableAutoBackup}
                className={["inline-flex items-center rounded-full px-2 py-1 text-xs font-medium cursor-pointer transition-opacity hover:opacity-70", autoBackupEnabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"].join(" ")}
                title={autoBackupEnabled ? "Désactiver la sauvegarde automatique" : "Activer la sauvegarde automatique"}
              >
                Auto : {autoBackupEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {backfillProgress && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground">
              {backfillLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />}
              {backfillProgress}
            </div>
          )}
          {recalcPRUProgress && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground">
              {recalcPRULoading && <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />}
              {recalcPRUProgress}
            </div>
          )}

          <Outlet />

          <ImportTransactions
            open={importTxOpen}
            onOpenChange={setImportTxOpen}
            onImportTransactions={handleImportTransactions}
          />

          <TransactionDialog
            open={dialogOpen && dialogInitialData?.type !== "dividende"}
            onOpenChange={setDialogOpen}
            onAddTransaction={handleAddTransaction}
            currentPortfolio={currentPortfolio}
            portfolios={portfolios}
            initialData={dialogInitialData}
          />

          <DividendDialog
            open={
              (dialogOpen && dialogInitialData?.type === "dividende") ||
              dividendDialogOpen
            }
            onOpenChange={v => { if (!v) { setDialogOpen(false); setDividendDialogOpen(false); } }}
            onAddTransaction={handleAddTransaction}
            currentPortfolio={currentPortfolio}
            portfolios={portfolios}
            initialData={dividendDialogOpen ? dividendDialogInitialData : dialogInitialData}
          />
        </div>
      </div>
    </PortfolioContext.Provider>
  );
}