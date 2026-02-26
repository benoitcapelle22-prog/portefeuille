import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { PortfolioSelector, Portfolio } from "./PortfolioSelector";
import { Transaction } from "./TransactionForm";
import { Position } from "./CurrentPositions";
import { ClosedPosition } from "./ClosedPositions";
import { TransactionDialog } from "./TransactionDialog";
import { TrendingUp, LayoutDashboard, Receipt, Calculator } from "lucide-react";
import { Button } from "./ui/button";
import { db, migrateFromLocalStorage, getCurrentPortfolioId, setCurrentPortfolioId as saveCurrentPortfolioId, DBTransaction, DBPosition, DBClosedPosition } from "../db";
import { useLiveQuery } from "dexie-react-hooks";
import { exportDatabase, importDatabase } from "../utils/backup";
import { useRef } from "react";

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
  handleCreatePortfolio: (portfolio: Omit<Portfolio, "id">) => void;
  handleUpdatePortfolio: (id: string, portfolio: Omit<Portfolio, "id">) => void;
  handleDeletePortfolio: (id: string) => void;
  setCurrentPortfolioId: (id: string) => void;
  handleAddTransaction: (transaction: Omit<Transaction, "id">, portfolioId?: string) => void;
  handleDeleteTransaction: (id: string) => void;
  handlePositionAction: (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => void;
  handleUpdateCash: (amount: number, type: "deposit" | "withdrawal", date: string) => void;
  handleUpdateStopLoss: (code: string, stopLoss: number | undefined) => void;
  handleUpdateCurrentPrice: (code: string, manualCurrentPrice: number | undefined) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  dialogInitialData: any;
}

// Contexte pour partager les données entre les pages
import { createContext, useContext } from "react";

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error("usePortfolio must be used within PortfolioLayout");
  }
  return context;
};

export function PortfolioLayout() {
  const location = useLocation();
  const [currentPortfolioId, setCurrentPortfolioIdState] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitialData, setDialogInitialData] = useState<{
    code?: string;
    name?: string;
    type?: "achat" | "vente" | "dividende";
    quantity?: number;
    portfolioId?: string; // Ajouter l'ID du portefeuille
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Charger les données depuis IndexedDB avec Dexie
  const portfolios = useLiveQuery(() => db.portfolios.toArray(), []);
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []);
  const allPositions = useLiveQuery(() => db.positions.toArray(), []);
  const allClosedPositions = useLiveQuery(() => db.closedPositions.toArray(), []);

  // Construire portfolioData à partir des données de la base
  const portfolioData: Record<string, PortfolioData> = {};
  
  if (portfolios && allTransactions && allPositions && allClosedPositions) {
    portfolios.forEach(portfolio => {
      const portfolioTransactions = allTransactions
        .filter(t => t.portfolioId === portfolio.id)
        .map(t => {
          const { portfolioId, ...transaction } = t;
          return transaction as Transaction;
        });

      const portfolioPositions = allPositions
        .filter(p => p.portfolioId === portfolio.id)
        .map(p => {
          const { portfolioId, id, ...position } = p;
          return position as Position;
        });

      const portfolioClosedPositions = allClosedPositions
        .filter(cp => cp.portfolioId === portfolio.id)
        .map(cp => {
          const { portfolioId, id, ...closedPosition } = cp;
          return closedPosition as ClosedPosition;
        });

      portfolioData[portfolio.id] = {
        transactions: portfolioTransactions,
        positions: portfolioPositions,
        closedPositions: portfolioClosedPositions,
      };
    });
  }

  // Migration et initialisation
  useEffect(() => {
    const initDB = async () => {
      try {
        // Effectuer la migration depuis localStorage
        const migrated = await migrateFromLocalStorage();
        if (migrated) {
          console.log('Données migrées depuis localStorage vers IndexedDB');
        }

        // Charger le portefeuille courant
        const savedCurrentId = await getCurrentPortfolioId();
        const loadedPortfolios = await db.portfolios.toArray();

        if (savedCurrentId && loadedPortfolios.find(p => p.id === savedCurrentId)) {
          setCurrentPortfolioIdState(savedCurrentId);
        } else if (loadedPortfolios.length > 0) {
          setCurrentPortfolioIdState(loadedPortfolios[0].id);
          await saveCurrentPortfolioId(loadedPortfolios[0].id);
        } else {
          // Créer un portefeuille par défaut
          const defaultPortfolio: Portfolio = {
            id: crypto.randomUUID(),
            name: "Mon portefeuille principal",
            category: "Trading",
            currency: "EUR",
            fees: {
              defaultFeesPercent: 0,
              defaultFeesMin: 0,
              defaultTFF: 0,
            },
            cash: 0,
          };
          await db.portfolios.add(defaultPortfolio);
          setCurrentPortfolioIdState(defaultPortfolio.id);
          await saveCurrentPortfolioId(defaultPortfolio.id);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Erreur lors de l\'initialisation de la base de données:', error);
        setIsLoading(false);
      }
    };

    initDB();
  }, []);

  // Fonction pour changer le portefeuille courant
  const setCurrentPortfolioId = async (id: string) => {
    setCurrentPortfolioIdState(id);
    await saveCurrentPortfolioId(id);
  };

  // Obtenir les données du portefeuille actuel
  const currentData: PortfolioData = currentPortfolioId && portfolioData[currentPortfolioId]
    ? portfolioData[currentPortfolioId]
    : { transactions: [], positions: [], closedPositions: [] };

  const currentPortfolio = portfolios?.find(p => p.id === currentPortfolioId);

  // Obtenir les données du portefeuille actuel ou consolidées
  const getCurrentData = (): PortfolioData => {
    if (!portfolios) return { transactions: [], positions: [], closedPositions: [] };
    
    if (currentPortfolioId === "ALL") {
      // Vue consolidée: agréger toutes les données sans fusionner les positions
      const allTransactions: Transaction[] = [];
      const allPositions: Position[] = [];
      const allClosedPositions: ClosedPosition[] = [];
      
      portfolios.forEach(portfolio => {
        const data = portfolioData[portfolio.id];
        if (!data) return;
        
        // Utiliser le code du portefeuille ou son nom comme fallback
        const portfolioIdentifier = portfolio.code || portfolio.name;
        
        // Ajouter toutes les transactions avec le code du portefeuille
        data.transactions.forEach(transaction => {
          allTransactions.push({
            ...transaction,
            portfolioCode: portfolioIdentifier,
          });
        });
        
        // Ajouter les positions avec le code et l'ID du portefeuille
        data.positions.forEach(position => {
          allPositions.push({
            ...position,
            portfolioCode: portfolioIdentifier,
            portfolioId: portfolio.id,
          });
        });
        
        // Ajouter les positions clôturées avec le code du portefeuille
        data.closedPositions.forEach(closedPosition => {
          allClosedPositions.push({
            ...closedPosition,
            portfolioCode: portfolioIdentifier,
          });
        });
      });
      
      return {
        transactions: allTransactions,
        positions: allPositions,
        closedPositions: allClosedPositions,
      };
    }
    
    // Portefeuille individuel
    return currentPortfolioId && portfolioData[currentPortfolioId]
      ? portfolioData[currentPortfolioId]
      : { transactions: [], positions: [], closedPositions: [] };
  };

  const consolidatedData = getCurrentData();

  const updateCurrentPortfolioData = async (data: Partial<PortfolioData>) => {
    if (!currentPortfolioId || currentPortfolioId === "ALL") return;

    try {
      // Mettre à jour les transactions
      if (data.transactions) {
        await db.transactions.where('portfolioId').equals(currentPortfolioId).delete();
        const dbTransactions: DBTransaction[] = data.transactions.map(t => ({
          ...t,
          portfolioId: currentPortfolioId
        }));
        await db.transactions.bulkAdd(dbTransactions);
      }

      // Mettre à jour les positions
      if (data.positions) {
        await db.positions.where('portfolioId').equals(currentPortfolioId).delete();
        const dbPositions: DBPosition[] = data.positions.map(p => ({
          ...p,
          portfolioId: currentPortfolioId
        }));
        await db.positions.bulkAdd(dbPositions);
      }

      // Mettre à jour les positions clôturées
      if (data.closedPositions) {
        await db.closedPositions.where('portfolioId').equals(currentPortfolioId).delete();
        const dbClosedPositions: DBClosedPosition[] = data.closedPositions.map(cp => ({
          ...cp,
          portfolioId: currentPortfolioId
        }));
        await db.closedPositions.bulkAdd(dbClosedPositions);
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour des données:', error);
    }
  };

  const handleCreatePortfolio = async (portfolio: Omit<Portfolio, "id">) => {
    const newPortfolio: Portfolio = {
      id: crypto.randomUUID(),
      ...portfolio,
      cash: 0,
    };

    try {
      await db.portfolios.add(newPortfolio);
      await setCurrentPortfolioId(newPortfolio.id);
    } catch (error) {
      console.error('Erreur lors de la création du portefeuille:', error);
    }
  };

  const handleUpdatePortfolio = async (id: string, portfolio: Omit<Portfolio, "id">) => {
    try {
      const existingPortfolio = await db.portfolios.get(id);
      if (existingPortfolio) {
        await db.portfolios.update(id, { ...portfolio, cash: existingPortfolio.cash });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du portefeuille:', error);
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    try {
      await db.portfolios.delete(id);
      await db.transactions.where('portfolioId').equals(id).delete();
      await db.positions.where('portfolioId').equals(id).delete();
      await db.closedPositions.where('portfolioId').equals(id).delete();

      const remainingPortfolios = await db.portfolios.toArray();
      if (currentPortfolioId === id) {
        if (remainingPortfolios.length > 0) {
          await setCurrentPortfolioId(remainingPortfolios[0].id);
        } else {
          setCurrentPortfolioIdState(null);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du portefeuille:', error);
    }
  };

  const handleAddTransaction = (transaction: Omit<Transaction, "id">, portfolioId?: string) => {
    // Utiliser le portfolioId fourni, sinon utiliser le currentPortfolioId
    const targetPortfolioId = portfolioId || currentPortfolioId;
    
    if (!targetPortfolioId) return;

    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
    };

    // Obtenir les données du portefeuille cible
    const targetData = portfolioData[targetPortfolioId] || { transactions: [], positions: [], closedPositions: [] };
    const newTransactions = [...targetData.transactions, newTransaction];

    if (transaction.type === "achat") {
      handlePurchase(newTransaction, newTransactions, targetPortfolioId);
    } else if (transaction.type === "vente") {
      handleSale(newTransaction, newTransactions, targetPortfolioId);
    } else if (transaction.type === "dividende") {
      handleDividend(newTransaction, newTransactions, targetPortfolioId);
    }
  };

  const handlePurchase = async (transaction: Transaction, newTransactions: Transaction[], portfolioId: string) => {
    // Obtenir les données du portefeuille cible
    const targetData = portfolioData[portfolioId] || { transactions: [], positions: [], closedPositions: [] };
    const existingPosition = targetData.positions.find(p => p.code === transaction.code);
    
    // Convertir le montant dans la devise du portefeuille
    const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
    // Les frais et TFF sont DÉJÀ dans la devise du portefeuille, ne pas les convertir
    const convertedFees = transaction.fees;
    const convertedTff = transaction.tff;
    
    // Calculer le coût total de l'achat
    const totalCost = transaction.quantity * convertedUnitPrice + convertedFees + convertedTff;
    
    // Mettre à jour les liquidités
    if (portfolioId) {
      const targetPortfolio = await db.portfolios.get(portfolioId);
      if (targetPortfolio) {
        const newCash = (targetPortfolio.cash || 0) - totalCost;
        await db.portfolios.update(portfolioId, { cash: newCash });
      }
    }
    
    if (existingPosition) {
      // Mise à jour de la position existante avec nouveau PRU
      const newTotalCost = existingPosition.totalCost + totalCost;
      const newQuantity = existingPosition.quantity + transaction.quantity;
      const newPRU = newTotalCost / newQuantity;

      const updatedPositions = targetData.positions.map(p =>
        p.code === transaction.code
          ? {
              ...p,
              quantity: newQuantity,
              totalCost: newTotalCost,
              pru: newPRU,
              currency: transaction.currency,
            }
          : p
      );

      await updateCurrentPortfolioData({
        transactions: newTransactions,
        positions: updatedPositions,
      });
    } else {
      // Nouvelle position
      const pru = totalCost / transaction.quantity;

      await updateCurrentPortfolioData({
        transactions: newTransactions,
        positions: [
          ...targetData.positions,
          {
            code: transaction.code,
            name: transaction.name,
            quantity: transaction.quantity,
            totalCost,
            pru,
            currency: transaction.currency,
            sector: transaction.sector, // Ajouter le secteur
          },
        ],
      });
    }
  };

  const handleSale = async (transaction: Transaction, newTransactions: Transaction[], portfolioId: string) => {
    // Obtenir les données du portefeuille cible
    const targetData = portfolioData[portfolioId] || { transactions: [], positions: [], closedPositions: [] };
    const existingPosition = targetData.positions.find(p => p.code === transaction.code);

    if (!existingPosition) {
      alert("Erreur: Aucune position trouvée pour ce code");
      return;
    }

    if (existingPosition.quantity < transaction.quantity) {
      alert("Erreur: Quantité insuffisante pour la vente");
      return;
    }

    // Convertir le montant dans la devise du portefeuille
    const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
    const convertedFees = transaction.fees * transaction.conversionRate;
    const convertedTff = transaction.tff * transaction.conversionRate;

    // Calculer le prix de vente moyen
    const totalSale = transaction.quantity * convertedUnitPrice - convertedFees - convertedTff;
    const averageSalePrice = totalSale / transaction.quantity;

    // Mettre à jour les liquidités (augmentation)
    if (portfolioId) {
      const targetPortfolio = await db.portfolios.get(portfolioId);
      if (targetPortfolio) {
        const newCash = (targetPortfolio.cash || 0) + totalSale;
        await db.portfolios.update(portfolioId, { cash: newCash });
      }
    }

    // Calculer le montant total acheté pour les titres vendus
    const totalPurchase = transaction.quantity * existingPosition.pru;

    // Calculer la plus/moins-value
    const gainLoss = totalSale - totalPurchase;
    const gainLossPercent = (gainLoss / totalPurchase) * 100;

    // Trouver la date d'achat initiale
    const purchaseTransaction = newTransactions
      .filter(t => t.code === transaction.code && t.type === "achat")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

    // Calculer les dividendes reçus entre l'achat et la vente
    const purchaseDate = new Date(purchaseTransaction?.date || transaction.date);
    const saleDate = new Date(transaction.date);
    const dividends = newTransactions
      .filter(t => 
        t.code === transaction.code && 
        t.type === "dividende" && 
        new Date(t.date) >= purchaseDate && 
        new Date(t.date) <= saleDate
      )
      .reduce((sum, t) => {
        const dividendAmount = (t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0);
        return sum + dividendAmount;
      }, 0);

    const newQuantity = existingPosition.quantity - transaction.quantity;

    const closedPosition: ClosedPosition = {
      code: transaction.code,
      name: transaction.name,
      purchaseDate: purchaseTransaction?.date || transaction.date,
      saleDate: transaction.date,
      quantity: transaction.quantity,
      pru: existingPosition.pru,
      averageSalePrice,
      gainLoss,
      gainLossPercent,
      dividends,
      sector: existingPosition.sector, // Ajouter le secteur de la position
    };

    if (newQuantity === 0) {
      // Position entièrement vendue
      await updateCurrentPortfolioData({
        transactions: newTransactions,
        positions: targetData.positions.filter(p => p.code !== transaction.code),
        closedPositions: [...targetData.closedPositions, closedPosition],
      });
    } else {
      // Vente partielle
      const newTotalCost = existingPosition.totalCost - totalPurchase;
      
      await updateCurrentPortfolioData({
        transactions: newTransactions,
        positions: targetData.positions.map(p =>
          p.code === transaction.code
            ? {
                ...p,
                quantity: newQuantity,
                totalCost: newTotalCost,
              }
            : p
        ),
        closedPositions: [...targetData.closedPositions, closedPosition],
      });
    }
  };

  const handleDividend = async (transaction: Transaction, newTransactions: Transaction[], portfolioId: string) => {
    // Obtenir les données du portefeuille cible
    const targetData = portfolioData[portfolioId] || { transactions: [], positions: [], closedPositions: [] };
    
    // Mettre à jour les liquidités (augmentation pour les dividendes)
    if (portfolioId) {
      const targetPortfolio = await db.portfolios.get(portfolioId);
      if (targetPortfolio) {
        const dividendAmount = (transaction.unitPrice * transaction.quantity * transaction.conversionRate) - (transaction.tax || 0);
        const newCash = (targetPortfolio.cash || 0) + dividendAmount;
        await db.portfolios.update(portfolioId, { cash: newCash });
      }
    }
    
    await updateCurrentPortfolioData({
      transactions: newTransactions,
    });
  };

  const handleDeleteTransaction = (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette transaction ?")) {
      return;
    }

    const updatedTransactions = currentData.transactions.filter(t => t.id !== id);
    
    const newPositions: Position[] = [];
    const newClosedPositions: ClosedPosition[] = [];

    updatedTransactions
      .filter(t => t.type === "achat" || t.type === "vente")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(transaction => {
        if (transaction.type === "achat") {
          const existingPosition = newPositions.find(p => p.code === transaction.code);
          const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
          const convertedFees = transaction.fees * transaction.conversionRate;
          const convertedTff = transaction.tff * transaction.conversionRate;

          if (existingPosition) {
            const newTotalCost = existingPosition.totalCost + 
              (transaction.quantity * convertedUnitPrice + convertedFees + convertedTff);
            const newQuantity = existingPosition.quantity + transaction.quantity;
            const newPRU = newTotalCost / newQuantity;

            existingPosition.quantity = newQuantity;
            existingPosition.totalCost = newTotalCost;
            existingPosition.pru = newPRU;
            existingPosition.currency = transaction.currency;
          } else {
            const totalCost = transaction.quantity * convertedUnitPrice + convertedFees + convertedTff;
            const pru = totalCost / transaction.quantity;

            newPositions.push({
              code: transaction.code,
              name: transaction.name,
              quantity: transaction.quantity,
              totalCost,
              pru,
              currency: transaction.currency,
              sector: transaction.sector, // Ajouter le secteur
            });
          }
        } else if (transaction.type === "vente") {
          const existingPosition = newPositions.find(p => p.code === transaction.code);
          
          if (existingPosition && existingPosition.quantity >= transaction.quantity) {
            const convertedUnitPrice = transaction.unitPrice * transaction.conversionRate;
            const convertedFees = transaction.fees * transaction.conversionRate;
            const convertedTff = transaction.tff * transaction.conversionRate;

            const totalSale = transaction.quantity * convertedUnitPrice - convertedFees - convertedTff;
            const averageSalePrice = totalSale / transaction.quantity;
            const totalPurchase = transaction.quantity * existingPosition.pru;
            const gainLoss = totalSale - totalPurchase;
            const gainLossPercent = (gainLoss / totalPurchase) * 100;

            const purchaseTransaction = updatedTransactions
              .filter(t => t.code === transaction.code && t.type === "achat")
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

            const purchaseDate = new Date(purchaseTransaction?.date || transaction.date);
            const saleDate = new Date(transaction.date);
            const dividends = updatedTransactions
              .filter(t => 
                t.code === transaction.code && 
                t.type === "dividende" && 
                new Date(t.date) >= purchaseDate && 
                new Date(t.date) <= saleDate
              )
              .reduce((sum, t) => {
                const dividendAmount = (t.unitPrice * t.quantity * t.conversionRate) - (t.tax || 0);
                return sum + dividendAmount;
              }, 0);

            newClosedPositions.push({
              code: transaction.code,
              name: transaction.name,
              purchaseDate: purchaseTransaction?.date || transaction.date,
              saleDate: transaction.date,
              quantity: transaction.quantity,
              pru: existingPosition.pru,
              averageSalePrice,
              gainLoss,
              gainLossPercent,
              dividends,
              sector: existingPosition.sector, // Ajouter le secteur de la position
            });

            const newQuantity = existingPosition.quantity - transaction.quantity;
            if (newQuantity === 0) {
              const index = newPositions.indexOf(existingPosition);
              newPositions.splice(index, 1);
            } else {
              const newTotalCost = existingPosition.totalCost - totalPurchase;
              existingPosition.quantity = newQuantity;
              existingPosition.totalCost = newTotalCost;
            }
          }
        }
      });

    updateCurrentPortfolioData({
      transactions: updatedTransactions,
      positions: newPositions,
      closedPositions: newClosedPositions,
    });
  };

  const handlePositionAction = (action: 'achat' | 'vente' | 'dividende', position: Position, portfolioId?: string) => {
    setDialogInitialData({
      code: position.code,
      name: position.name,
      type: action,
      quantity: action === 'vente' ? position.quantity : undefined,
      portfolioId: portfolioId, // Stocker l'ID du portefeuille
    });
    setDialogOpen(true);
  };

  const handleUpdateCash = async (amount: number, type: "deposit" | "withdrawal", date: string) => {
    if (!currentPortfolioId || !portfolios) return;

    const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);
    if (!currentPortfolio) return;

    const newCash = type === "deposit" ? (currentPortfolio.cash || 0) + amount : (currentPortfolio.cash || 0) - amount;
    if (newCash < 0) {
      alert("Erreur: Le solde ne peut pas être négatif");
      return;
    }

    // Créer une transaction pour l'historique
    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      date,
      code: "CASH",
      name: type === "deposit" ? "Dépôt de liquidités" : "Retrait de liquidités",
      type: type === "deposit" ? "depot" : "retrait",
      quantity: 1,
      unitPrice: amount,
      fees: 0,
      tff: 0,
      currency: currentPortfolio.currency,
      conversionRate: 1,
    };

    // Mettre à jour les liquidités et ajouter la transaction
    await db.portfolios.update(currentPortfolioId, { cash: newCash });

    await updateCurrentPortfolioData({
      transactions: [...currentData.transactions, newTransaction],
    });
  };

  const handleUpdateStopLoss = async (code: string, stopLoss: number | undefined) => {
    if (!currentPortfolioId || !portfolios) return;

    // En vue consolidée, mettre à jour tous les portefeuilles contenant cette position
    if (currentPortfolioId === "ALL") {
      for (const portfolio of portfolios) {
        const portfolioPositions = portfolioData[portfolio.id]?.positions || [];
        const hasPosition = portfolioPositions.some(p => p.code === code);
        
        if (hasPosition) {
          const updatedPositions = portfolioPositions.map(position => {
            if (position.code === code) {
              return {
                ...position,
                stopLoss,
              };
            }
            return position;
          });
          
          // Mettre à jour dans la base de données
          await db.positions.where('portfolioId').equals(portfolio.id).delete();
          const dbPositions: DBPosition[] = updatedPositions.map(p => ({
            ...p,
            portfolioId: portfolio.id
          }));
          await db.positions.bulkAdd(dbPositions);
        }
      }
    } else {
      // Vue portefeuille individuel
      const currentPortfolioData = portfolioData[currentPortfolioId];
      if (!currentPortfolioData) return;

      const updatedPositions = currentPortfolioData.positions.map(position => {
        if (position.code === code) {
          return {
            ...position,
            stopLoss,
          };
        }
        return position;
      });

      await updateCurrentPortfolioData({
        positions: updatedPositions,
      });
    }
  };

  const handleUpdateCurrentPrice = async (code: string, manualCurrentPrice: number | undefined) => {
    if (!currentPortfolioId || !portfolios) return;

    // En vue consolidée, mettre à jour tous les portefeuilles contenant cette position
    if (currentPortfolioId === "ALL") {
      for (const portfolio of portfolios) {
        const portfolioPositions = portfolioData[portfolio.id]?.positions || [];
        const hasPosition = portfolioPositions.some(p => p.code === code);
        
        if (hasPosition) {
          const updatedPositions = portfolioPositions.map(position => {
            if (position.code === code) {
              return {
                ...position,
                manualCurrentPrice,
              };
            }
            return position;
          });
          
          // Mettre à jour dans la base de données
          await db.positions.where('portfolioId').equals(portfolio.id).delete();
          const dbPositions: DBPosition[] = updatedPositions.map(p => ({
            ...p,
            portfolioId: portfolio.id
          }));
          await db.positions.bulkAdd(dbPositions);
        }
      }
    } else {
      // Vue portefeuille individuel
      const currentPortfolioData = portfolioData[currentPortfolioId];
      if (!currentPortfolioData) return;

      const updatedPositions = currentPortfolioData.positions.map(position => {
        if (position.code === code) {
          return {
            ...position,
            manualCurrentPrice,
          };
        }
        return position;
      });

      await updateCurrentPortfolioData({
        positions: updatedPositions,
      });
    }
  };

  const contextValue: PortfolioContextType = {
    portfolios: portfolios || [],
    currentPortfolioId,
    currentPortfolio,
    currentData: consolidatedData,
    handleCreatePortfolio,
    handleUpdatePortfolio,
    handleDeletePortfolio,
    setCurrentPortfolioId,
    handleAddTransaction,
    handleDeleteTransaction,
    handlePositionAction,
    handleUpdateCash,
    handleUpdateStopLoss,
    handleUpdateCurrentPrice,
    dialogOpen,
    setDialogOpen,
    dialogInitialData,
  };

  // Afficher un état de chargement pendant l'initialisation
  if (isLoading || !portfolios) {
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

{/* Navigation + Backup */}
<div className="flex justify-between items-center border-b pb-2">
  
  {/* Navigation à gauche */}
  <div className="flex gap-2">
    <Link to="/">
      <Button
        variant={location.pathname === "/" ? "default" : "ghost"}
        className="gap-2"
      >
        <LayoutDashboard className="h-4 w-4" />
        Tableau de bord
      </Button>
    </Link>

    <Link to="/transactions">
      <Button
        variant={location.pathname === "/transactions" ? "default" : "ghost"}
        className="gap-2"
      >
        <Receipt className="h-4 w-4" />
        Transactions
      </Button>
    </Link>

    <Link to="/calculator">
      <Button
        variant={location.pathname === "/calculator" ? "default" : "ghost"}
        className="gap-2"
      >
        <Calculator className="h-4 w-4" />
        Calculatrice
      </Button>
    </Link>
  </div>

  {/* Backup à droite */}
  <div className="flex gap-2">
    <input
      ref={fileInputRef}
      type="file"
      accept="application/json"
      style={{ display: "none" }}
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const ok = confirm(
          "Importer ce fichier va remplacer toutes les données actuelles. Continuer ?"
        );
        if (!ok) {
          e.target.value = "";
          return;
        }

        await importDatabase(file);
        alert("Import terminé ✅");
        e.target.value = "";
      }}
    />

    <Button variant="outline" onClick={exportDatabase}>
      Exporter
    </Button>

    <Button onClick={() => fileInputRef.current?.click()}>
      Importer
    </Button>
  </div>
</div>


          {/* Contenu des pages */}
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