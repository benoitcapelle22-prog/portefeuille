import Dexie, { Table } from 'dexie';
import { Portfolio } from './components/PortfolioSelector';
import { Transaction } from './components/TransactionForm';
import { Position } from './components/CurrentPositions';
import { ClosedPosition } from './components/ClosedPositions';

// Extension des interfaces pour inclure l'ID du portefeuille
export interface DBTransaction extends Omit<Transaction, 'portfolioCode'> {
  portfolioId: string;
}

export interface DBPosition extends Omit<Position, 'portfolioCode'> {
  id?: number;
  portfolioId: string;
}

export interface DBClosedPosition extends Omit<ClosedPosition, 'portfolioCode'> {
  id?: number;
  portfolioId: string;
}

export interface Setting {
  key: string;
  value: string;
}

// Classe de la base de données
export class PortfolioDB extends Dexie {
  portfolios!: Table<Portfolio, string>;
  transactions!: Table<DBTransaction, string>;
  positions!: Table<DBPosition, number>;
  closedPositions!: Table<DBClosedPosition, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('PortfolioDB');
    
    // Version 1: Structure initiale
    this.version(1).stores({
      portfolios: 'id, name, category, currency',
      transactions: 'id, portfolioId, date, code, type',
      positions: '++id, portfolioId, code, [portfolioId+code]',
      closedPositions: '++id, portfolioId, code, saleDate',
      settings: 'key'
    });

    // Version 2: Ajout du champ sector
    this.version(2).stores({
      portfolios: 'id, name, category, currency',
      transactions: 'id, portfolioId, date, code, type, sector',
      positions: '++id, portfolioId, code, sector, [portfolioId+code]',
      closedPositions: '++id, portfolioId, code, saleDate, sector',
      settings: 'key'
    });
  }
}

// Instance unique de la base de données
export const db = new PortfolioDB();

// Fonction de migration depuis localStorage
export async function migrateFromLocalStorage(): Promise<boolean> {
  try {
    // Vérifier si la migration a déjà été effectuée
    const migrated = await db.settings.get('migrated');
    if (migrated?.value === 'true') {
      console.log('Migration déjà effectuée');
      return false;
    }

    console.log('Début de la migration depuis localStorage...');

    // 1. Migrer les portefeuilles
    const savedPortfolios = localStorage.getItem('portfolios');
    if (savedPortfolios) {
      const portfolios: Portfolio[] = JSON.parse(savedPortfolios);
      await db.portfolios.bulkPut(portfolios);
      console.log(`${portfolios.length} portefeuilles migrés`);
    }

    // 2. Migrer les données de portefeuille (transactions, positions, positions clôturées)
    const savedPortfolioData = localStorage.getItem('portfolio-data');
    if (savedPortfolioData) {
      const portfolioData: {
        [portfolioId: string]: {
          transactions: Transaction[];
          positions: Position[];
          closedPositions: ClosedPosition[];
        };
      } = JSON.parse(savedPortfolioData);

      for (const [portfolioId, data] of Object.entries(portfolioData)) {
        // Migrer les transactions
        if (data.transactions && data.transactions.length > 0) {
          const dbTransactions: DBTransaction[] = data.transactions.map(t => ({
            ...t,
            portfolioId
          }));
          await db.transactions.bulkPut(dbTransactions);
          console.log(`${dbTransactions.length} transactions migrées pour ${portfolioId}`);
        }

        // Migrer les positions
        if (data.positions && data.positions.length > 0) {
          const dbPositions: DBPosition[] = data.positions.map(p => ({
            ...p,
            portfolioId
          }));
          await db.positions.bulkPut(dbPositions);
          console.log(`${dbPositions.length} positions migrées pour ${portfolioId}`);
        }

        // Migrer les positions clôturées
        if (data.closedPositions && data.closedPositions.length > 0) {
          const dbClosedPositions: DBClosedPosition[] = data.closedPositions.map(cp => ({
            ...cp,
            portfolioId
          }));
          await db.closedPositions.bulkPut(dbClosedPositions);
          console.log(`${dbClosedPositions.length} positions clôturées migrées pour ${portfolioId}`);
        }
      }
    }

    // 3. Migrer l'ID du portefeuille courant
    const savedCurrentId = localStorage.getItem('current-portfolio-id');
    if (savedCurrentId) {
      await db.settings.put({ key: 'currentPortfolioId', value: savedCurrentId });
      console.log(`Portefeuille courant migré: ${savedCurrentId}`);
    }

    // Marquer la migration comme effectuée
    await db.settings.put({ key: 'migrated', value: 'true' });
    console.log('Migration terminée avec succès !');

    return true;
  } catch (error) {
    console.error('Erreur lors de la migration:', error);
    return false;
  }
}

// Utilitaire pour obtenir le portefeuille courant
export async function getCurrentPortfolioId(): Promise<string | null> {
  const setting = await db.settings.get('currentPortfolioId');
  return setting?.value || null;
}

// Utilitaire pour définir le portefeuille courant
export async function setCurrentPortfolioId(portfolioId: string): Promise<void> {
  await db.settings.put({ key: 'currentPortfolioId', value: portfolioId });
}
// =========================
// SETTINGS HELPERS
// =========================

export async function getSetting(key: string): Promise<string | null> {
  const setting = await db.settings.get(key);
  return setting ? setting.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}