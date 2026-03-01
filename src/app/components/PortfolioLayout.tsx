import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { PortfolioSelector, Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { Position } from "./CurrentPositions";
import { ClosedPosition } from "./ClosedPositions";
import { TransactionDialog } from "./TransactionDialog";
import { TrendingUp, LayoutDashboard, Receipt, Calculator, Download, Upload, HardDrive, PauseCircle, RotateCcw } from "lucide-react";
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
  DBTransaction,
  DBPosition,
  DBClosedPosition,
} from "../db";
import { supabase } from "../supabase";
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
  handlePositionAction: (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => void;
  handleUpdateCash: (amount: number, type: "deposit" | "withdrawal", date: string) => Promise<void>;
  handleUpdateStopLoss: (code: string, stopLoss: number | undefined) => Promise<void>;
  handleUpdateCurrentPrice: (code: string, manualCurrentPrice: number | undefined) => Promise<void>;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  dialogInitialData: any;
  refreshData: () => Promise<void>;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialData, setDialogInitialData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupNeedsPermission, setAutoBackupNeedsPermission] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const allPortfolios = await getPortfolios();
      for (const p of allPortfolios) {
        await dbDeletePortfolio(p.id); // cascade supprime tout
      }
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

  const currentData: PortfolioData = (() => {
    if (!currentPortfolioId) return { transactions: [], positions: [], closedPositions: [] };
    if (currentPortfolioId === "ALL") {
      const allTx: Transaction[] = [];
      const allPos: Position[] = [];
      const allClosed: ClosedPosition[] = [];
      portfolios.forEach(portfolio => {
        const data = portfolioData[portfolio.id];
        if (!data) return;
        const id = portfolio.code || portfolio.name;
        data.transactions.forEach(t => allTx.push({ ...t, portfolioCode: id }));
        data.positions.forEach(p => allPos.push({ ...p, portfolioCode: id, portfolioId: portfolio.id }));
        data.closedPositions.forEach(cp => allClosed.push({ ...cp, portfolioCode: id }));
      });
      return { transactions: allTx, positions: allPos, closedPositions: allClosed };
    }
    return portfolioData[currentPortfolioId] ?? { transactions: [], positions: [], closedPositions: [] };
  })();

  const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  const handleAddTransaction = async (transaction: Omit<Transaction, "id">, portfolioId?: string) => {
    const targetId = portfolioId || currentPortfolioId;
    if (!targetId) return;

    const newTx: DBTransaction = { ...transaction, id: crypto.randomUUID(), portfolioId: targetId };
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
      await upsertPosition({ portfolioId, code: tx.code, name: tx.name, quantity: newQuantity, totalCost: newTotalCost, pru: newTotalCost / newQuantity, currency: tx.currency, stopLoss: existing.stopLoss, manualCurrentPrice: existing.manualCurrentPrice, sector: tx.sector });
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

    const purchaseTx = newTransactions.filter(t => t.code === tx.code && t.type === "achat").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const purchaseDate = new Date(purchaseTx?.date || tx.date);
    const saleDate = new Date(tx.date);
    const dividends = newTransactions.filter(t => t.code === tx.code && t.type === "dividende" && new Date(t.date) >= purchaseDate && new Date(t.date) <= saleDate).reduce((sum, t) => sum + ((t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0)), 0);

    await addClosedPosition({ id: crypto.randomUUID(), portfolioId, code: tx.code, name: tx.name, purchaseDate: purchaseTx?.date || tx.date, saleDate: tx.date, quantity: tx.quantity, pru: existing.pru, averageSalePrice: totalSale / tx.quantity, totalPurchase, totalSale, gainLoss, gainLossPercent: (gainLoss / totalPurchase) * 100, dividends, sector: existing.sector });

    const newQuantity = existing.quantity - tx.quantity;
    if (newQuantity === 0) await dbDeletePosition(portfolioId, tx.code);
    else await upsertPosition({ portfolioId, code: tx.code, name: existing.name, quantity: newQuantity, totalCost: existing.totalCost - totalPurchase, pru: existing.pru, currency: existing.currency, stopLoss: existing.stopLoss, manualCurrentPrice: existing.manualCurrentPrice, sector: existing.sector });
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

    for (const tx of transactions) {
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
        const purchaseTx = allTx.filter(t => (t.code || "").trim().toUpperCase() === txCode && t.type === "achat").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        closedPositions.push({ id: crypto.randomUUID(), portfolioId: targetPortfolioId, code: tx.code, name: tx.name, purchaseDate: purchaseTx?.date || tx.date, saleDate: tx.date, quantity: tx.quantity, pru: pos.pru, totalPurchase, totalSale, averageSalePrice: totalSale / tx.quantity, gainLoss, gainLossPercent: (gainLoss / totalPurchase) * 100, dividends: 0, sector: pos.sector });
        const newQuantity = pos.quantity - tx.quantity;
        if (newQuantity === 0) positions.splice(idx, 1);
        else positions[idx] = { ...pos, quantity: newQuantity, totalCost: pos.totalCost - totalPurchase };
      }
    }

    await deleteTransactionsByPortfolio(targetPortfolioId);
    await deletePositionsByPortfolio(targetPortfolioId);
    await deleteClosedPositionsByPortfolio(targetPortfolioId);
    await bulkAddTransactions(allTx);
    await bulkUpsertPositions(positions);
    await bulkAddClosedPositions(closedPositions);
    await refreshData();
  };

  // ============================================================
  // DELETE TRANSACTION (recalcul complet)
  // ============================================================

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm("Supprimer cette transaction ?")) return;
    if (!currentPortfolioId || currentPortfolioId === "ALL") return;

    await dbDeleteTransaction(id);
    const updatedTransactions = currentData.transactions.filter(t => t.id !== id);
    const newPositions: DBPosition[] = [];
    const newClosedPositions: DBClosedPosition[] = [];

    updatedTransactions
      .filter(t => t.type === "achat" || t.type === "vente")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(transaction => {
        if (transaction.type === "achat") {
          const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
          const totalCost = transaction.quantity * convertedUnitPrice + transaction.fees * transaction.conversionRate + transaction.tff * transaction.conversionRate;
          const existing = newPositions.find(p => p.code === transaction.code);
          if (existing) {
            const newTotalCost = existing.totalCost + totalCost;
            const newQuantity = existing.quantity + transaction.quantity;
            existing.quantity = newQuantity; existing.totalCost = newTotalCost; existing.pru = newTotalCost / newQuantity;
          } else {
            newPositions.push({ id: crypto.randomUUID(), portfolioId: currentPortfolioId, code: transaction.code, name: transaction.name, quantity: transaction.quantity, totalCost, pru: totalCost / transaction.quantity, currency: transaction.currency, sector: transaction.sector });
          }
        } else if (transaction.type === "vente") {
          const existing = newPositions.find(p => p.code === transaction.code);
          if (existing && existing.quantity >= transaction.quantity) {
            const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
            const totalSale = transaction.quantity * convertedUnitPrice - transaction.fees * transaction.conversionRate - transaction.tff * transaction.conversionRate;
            const totalPurchase = transaction.quantity * existing.pru;
            const gainLoss = totalSale - totalPurchase;
            const purchaseTx = updatedTransactions.filter(t => t.code === transaction.code && t.type === "achat").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
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

    await deletePositionsByPortfolio(currentPortfolioId);
    await deleteClosedPositionsByPortfolio(currentPortfolioId);
    await bulkUpsertPositions(newPositions);
    await bulkAddClosedPositions(newClosedPositions);
    await refreshData();
  };

  // ============================================================
  // ACTIONS POSITIONS
  // ============================================================

  const handlePositionAction = (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => {
    setDialogInitialData({ code: position.code, name: position.name, type: action, quantity: action === 'vente' ? position.quantity : undefined, portfolioId });
    setDialogOpen(true);
  };

  const handleUpdateCash = async (amount: number, type: "deposit" | "withdrawal", date: string) => {
    if (!currentPortfolioId || !currentPortfolio) return;
    const newCash = type === "deposit" ? (currentPortfolio.cash || 0) + amount : (currentPortfolio.cash || 0) - amount;
    if (newCash < 0) { alert("Erreur: Le solde ne peut pas être négatif"); return; }
    const newTransaction: DBTransaction = { id: crypto.randomUUID(), portfolioId: currentPortfolioId, date, code: "CASH", name: type === "deposit" ? "Dépôt de liquidités" : "Retrait de liquidités", type: type === "deposit" ? "depot" : "retrait", quantity: 1, unitPrice: amount, fees: 0, tff: 0, currency: currentPortfolio.currency, conversionRate: 1 };
    await dbUpdatePortfolio(currentPortfolioId, { cash: newCash });
    await dbAddTransaction(newTransaction);
    await refreshData();
  };

  const handleUpdateStopLoss = async (code: string, stopLoss: number | undefined) => {
    if (!currentPortfolioId) return;
    const portfolioIds = currentPortfolioId === "ALL" ? portfolios.map(p => p.id) : [currentPortfolioId];
    for (const pid of portfolioIds) {
      const pos = portfolioData[pid]?.positions.find(p => p.code === code);
      if (pos) await upsertPosition({ portfolioId: pid, code: pos.code, name: pos.name, quantity: pos.quantity, totalCost: pos.totalCost, pru: pos.pru, currency: pos.currency, stopLoss, manualCurrentPrice: pos.manualCurrentPrice, sector: pos.sector });
    }
    await refreshData();
  };

  const handleUpdateCurrentPrice = async (code: string, manualCurrentPrice: number | undefined) => {
    if (!currentPortfolioId) return;
    const portfolioIds = currentPortfolioId === "ALL" ? portfolios.map(p => p.id) : [currentPortfolioId];
    for (const pid of portfolioIds) {
      const pos = portfolioData[pid]?.positions.find(p => p.code === code);
      if (pos) await upsertPosition({ portfolioId: pid, code: pos.code, name: pos.name, quantity: pos.quantity, totalCost: pos.totalCost, pru: pos.pru, currency: pos.currency, stopLoss: pos.stopLoss, manualCurrentPrice, sector: pos.sector });
    }
    await refreshData();
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
    refreshData,
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
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="size-8 text-primary" />
            <h1 className="text-3xl">Suivi de Portefeuille Boursier</h1>
          </div>

          <PortfolioSelector
            portfolios={portfolios}
            currentPortfolioId={currentPortfolioId}
            onCreatePortfolio={handleCreatePortfolio}
            onUpdatePortfolio={handleUpdatePortfolio}
            onDeletePortfolio={handleDeletePortfolio}
            onSelectPortfolio={setCurrentPortfolioId}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
            <div className="flex flex-wrap gap-2">
              <Link to="/"><Button variant={location.pathname === "/" ? "default" : "ghost"} className="gap-2"><LayoutDashboard className="h-4 w-4" />Tableau de bord</Button></Link>
              <Link to="/transactions"><Button variant={location.pathname === "/transactions" ? "default" : "ghost"} className="gap-2"><Receipt className="h-4 w-4" />Transactions</Button></Link>
              <Link to="/calculator"><Button variant={location.pathname === "/calculator" ? "default" : "ghost"} className="gap-2"><Calculator className="h-4 w-4" />Calculatrice</Button></Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
              <Button onClick={exportDatabase} className="gap-2"><Download className="h-4 w-4" />Exporter</Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2"><HardDrive className="h-4 w-4" />Sauvegarde</Button>
                </DropdownMenuTrigger>

                {autoBackupNeedsPermission && (
                  <Button variant="outline" onClick={onReauthorizeAutoBackup} className="gap-2"><HardDrive className="h-4 w-4" />Réactiver</Button>
                )}

                <span className={["ml-1 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium", autoBackupEnabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"].join(" ")}>
                  Auto: {autoBackupEnabled ? "ON" : "OFF"}
                </span>

                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" />Importer un fichier…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEnableAutoBackup} className="gap-2"><HardDrive className="h-4 w-4" />Activer sauvegarde automatique</DropdownMenuItem>
                  <DropdownMenuItem onClick={onDisableAutoBackup} className="gap-2"><PauseCircle className="h-4 w-4" />Désactiver sauvegarde automatique</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleResetDatabase} className="gap-2 text-destructive focus:text-destructive"><RotateCcw className="h-4 w-4" />Réinitialiser…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Outlet />

          <TransactionDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onAddTransaction={handleAddTransaction}
            currentPortfolio={currentPortfolio}
            portfolios={portfolios}
            initialData={dialogInitialData}
          />
        </div>
      </div>
    </PortfolioContext.Provider>
  );
}