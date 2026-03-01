/**
 * db.ts — Couche d'accès aux données via Supabase
 * Remplace Dexie/IndexedDB. Même interface publique pour limiter les changements
 * dans le reste de l'application.
 */

import { supabase } from './supabase';
import { Portfolio } from './components/PortfolioSelector';
import { Transaction } from './components/TransactionForm';
import { Position } from './components/CurrentPositions';
import { ClosedPosition } from './components/ClosedPositions';

// ============================================================
// TYPES DB (camelCase côté app ↔ snake_case côté Supabase)
// ============================================================

export interface DBTransaction extends Omit<Transaction, 'portfolioCode'> {
  portfolioId: string;
}

export interface DBPosition extends Omit<Position, 'portfolioCode'> {
  id?: string;
  portfolioId: string;
}

export interface DBClosedPosition extends Omit<ClosedPosition, 'portfolioCode'> {
  id?: string;
  portfolioId: string;
}

export interface Setting {
  key: string;
  value: string;
}

// ============================================================
// MAPPERS snake_case → camelCase
// ============================================================

function mapTransaction(row: any): DBTransaction {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    date: row.date,
    code: row.code,
    name: row.name,
    type: row.type,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    fees: Number(row.fees ?? 0),
    tff: Number(row.tff ?? 0),
    currency: row.currency,
    conversionRate: Number(row.conversion_rate ?? 1),
    tax: Number(row.tax ?? 0),
    sector: row.sector,
  };
}

function mapPosition(row: any): DBPosition {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    code: row.code,
    name: row.name,
    quantity: Number(row.quantity),
    totalCost: Number(row.total_cost),
    pru: Number(row.pru),
    currency: row.currency,
    stopLoss: row.stop_loss !== null ? Number(row.stop_loss) : undefined,
    manualCurrentPrice: row.manual_current_price !== null ? Number(row.manual_current_price) : undefined,
    sector: row.sector,
  };
}

function mapClosedPosition(row: any): DBClosedPosition {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    code: row.code,
    name: row.name,
    purchaseDate: row.purchase_date,
    saleDate: row.sale_date,
    quantity: Number(row.quantity),
    pru: Number(row.pru),
    averageSalePrice: Number(row.average_sale_price),
    totalPurchase: Number(row.total_purchase),
    totalSale: Number(row.total_sale),
    gainLoss: Number(row.gain_loss),
    gainLossPercent: Number(row.gain_loss_percent),
    dividends: Number(row.dividends ?? 0),
    sector: row.sector,
  };
}

function mapPortfolio(row: any): Portfolio {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    currency: row.currency,
    code: row.code,
    fees: typeof row.fees === 'string' ? JSON.parse(row.fees) : (row.fees ?? { defaultFeesPercent: 0, defaultFeesMin: 0, defaultTFF: 0 }),
    cash: Number(row.cash ?? 0),
  };
}

// ============================================================
// PORTFOLIOS
// ============================================================

export async function getPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await supabase.from('portfolios').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapPortfolio);
}

export async function createPortfolio(portfolio: Portfolio): Promise<void> {
  const { error } = await supabase.from('portfolios').insert({
    id: portfolio.id,
    name: portfolio.name,
    category: portfolio.category,
    currency: portfolio.currency,
    code: portfolio.code,
    fees: portfolio.fees,
    cash: portfolio.cash ?? 0,
  });
  if (error) throw error;
}

export async function updatePortfolio(id: string, updates: Partial<Portfolio>): Promise<void> {
  const row: any = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.currency !== undefined) row.currency = updates.currency;
  if (updates.code !== undefined) row.code = updates.code;
  if (updates.fees !== undefined) row.fees = updates.fees;
  if (updates.cash !== undefined) row.cash = updates.cash;

  const { error } = await supabase.from('portfolios').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePortfolio(id: string): Promise<void> {
  // Les transactions/positions sont supprimées en cascade (ON DELETE CASCADE)
  const { error } = await supabase.from('portfolios').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// TRANSACTIONS
// ============================================================

export async function getTransactions(portfolioId?: string): Promise<DBTransaction[]> {
  let query = supabase.from('transactions').select('*').order('date');
  if (portfolioId) query = query.eq('portfolio_id', portfolioId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapTransaction);
}

export async function addTransaction(tx: DBTransaction): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    id: tx.id,
    portfolio_id: tx.portfolioId,
    date: tx.date,
    code: tx.code,
    name: tx.name,
    type: tx.type,
    quantity: tx.quantity,
    unit_price: tx.unitPrice,
    fees: tx.fees ?? 0,
    tff: tx.tff ?? 0,
    currency: tx.currency,
    conversion_rate: tx.conversionRate ?? 1,
    tax: tx.tax ?? 0,
    sector: tx.sector,
  });
  if (error) throw error;
}

export async function bulkAddTransactions(txs: DBTransaction[]): Promise<void> {
  if (txs.length === 0) return;
  const rows = txs.map(tx => ({
    id: tx.id,
    portfolio_id: tx.portfolioId,
    date: tx.date,
    code: tx.code,
    name: tx.name,
    type: tx.type,
    quantity: tx.quantity,
    unit_price: tx.unitPrice,
    fees: tx.fees ?? 0,
    tff: tx.tff ?? 0,
    currency: tx.currency,
    conversion_rate: tx.conversionRate ?? 1,
    tax: tx.tax ?? 0,
    sector: tx.sector,
  }));
  const { error } = await supabase.from('transactions').insert(rows);
  if (error) throw error;
}

export async function deleteTransactionsByPortfolio(portfolioId: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('portfolio_id', portfolioId);
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// POSITIONS
// ============================================================

export async function getPositions(portfolioId?: string): Promise<DBPosition[]> {
  let query = supabase.from('positions').select('*');
  if (portfolioId) query = query.eq('portfolio_id', portfolioId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapPosition);
}

export async function upsertPosition(pos: DBPosition): Promise<void> {
  const { error } = await supabase.from('positions').upsert({
    id: pos.id ?? crypto.randomUUID(),
    portfolio_id: pos.portfolioId,
    code: pos.code,
    name: pos.name,
    quantity: pos.quantity,
    total_cost: pos.totalCost,
    pru: pos.pru,
    currency: pos.currency,
    stop_loss: pos.stopLoss ?? null,
    manual_current_price: pos.manualCurrentPrice ?? null,
    sector: pos.sector,
  }, { onConflict: 'portfolio_id,code' });
  if (error) throw error;
}

export async function bulkUpsertPositions(positions: DBPosition[]): Promise<void> {
  if (positions.length === 0) return;
  const rows = positions.map(pos => ({
    id: pos.id ?? crypto.randomUUID(),
    portfolio_id: pos.portfolioId,
    code: pos.code,
    name: pos.name,
    quantity: pos.quantity,
    total_cost: pos.totalCost,
    pru: pos.pru,
    currency: pos.currency,
    stop_loss: pos.stopLoss ?? null,
    manual_current_price: pos.manualCurrentPrice ?? null,
    sector: pos.sector,
  }));
  const { error } = await supabase.from('positions').upsert(rows, { onConflict: 'portfolio_id,code' });
  if (error) throw error;
}

export async function deletePositionsByPortfolio(portfolioId: string): Promise<void> {
  const { error } = await supabase.from('positions').delete().eq('portfolio_id', portfolioId);
  if (error) throw error;
}

export async function deletePosition(portfolioId: string, code: string): Promise<void> {
  const { error } = await supabase.from('positions').delete()
    .eq('portfolio_id', portfolioId)
    .eq('code', code);
  if (error) throw error;
}

// ============================================================
// CLOSED POSITIONS
// ============================================================

export async function getClosedPositions(portfolioId?: string): Promise<DBClosedPosition[]> {
  let query = supabase.from('closed_positions').select('*').order('sale_date');
  if (portfolioId) query = query.eq('portfolio_id', portfolioId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapClosedPosition);
}

export async function addClosedPosition(cp: DBClosedPosition): Promise<void> {
  const { error } = await supabase.from('closed_positions').insert({
    id: cp.id ?? crypto.randomUUID(),
    portfolio_id: cp.portfolioId,
    code: cp.code,
    name: cp.name,
    purchase_date: cp.purchaseDate,
    sale_date: cp.saleDate,
    quantity: cp.quantity,
    pru: cp.pru,
    average_sale_price: cp.averageSalePrice,
    total_purchase: cp.totalPurchase,
    total_sale: cp.totalSale,
    gain_loss: cp.gainLoss,
    gain_loss_percent: cp.gainLossPercent,
    dividends: cp.dividends ?? 0,
    sector: cp.sector,
  });
  if (error) throw error;
}

export async function bulkAddClosedPositions(cps: DBClosedPosition[]): Promise<void> {
  if (cps.length === 0) return;
  const rows = cps.map(cp => ({
    id: cp.id ?? crypto.randomUUID(),
    portfolio_id: cp.portfolioId,
    code: cp.code,
    name: cp.name,
    purchase_date: cp.purchaseDate,
    sale_date: cp.saleDate,
    quantity: cp.quantity,
    pru: cp.pru,
    average_sale_price: cp.averageSalePrice,
    total_purchase: cp.totalPurchase,
    total_sale: cp.totalSale,
    gain_loss: cp.gainLoss,
    gain_loss_percent: cp.gainLossPercent,
    dividends: cp.dividends ?? 0,
    sector: cp.sector,
  }));
  const { error } = await supabase.from('closed_positions').insert(rows);
  if (error) throw error;
}

export async function deleteClosedPositionsByPortfolio(portfolioId: string): Promise<void> {
  const { error } = await supabase.from('closed_positions').delete().eq('portfolio_id', portfolioId);
  if (error) throw error;
}

// ============================================================
// SETTINGS
// ============================================================

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', key).single();
  if (error) return null;
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('settings').upsert({ key, value });
  if (error) throw error;
}

export async function getCurrentPortfolioId(): Promise<string | null> {
  return getSetting('currentPortfolioId');
}

export async function setCurrentPortfolioId(portfolioId: string): Promise<void> {
  return setSetting('currentPortfolioId', portfolioId);
}

export async function getAllSettings(): Promise<Setting[]> {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) throw error;
  return data ?? [];
}