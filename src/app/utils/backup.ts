// backup.ts — adapté pour Supabase (remplace Dexie)
import {
  getPortfolios,
  getTransactions,
  getPositions,
  getClosedPositions,
  getAllSettings,
  deleteTransactionsByPortfolio,
  deletePositionsByPortfolio,
  deleteClosedPositionsByPortfolio,
  bulkAddTransactions,
  bulkUpsertPositions,
  bulkAddClosedPositions,
  createPortfolio,
  deletePortfolio,
  setSetting,
} from '../db';
import { supabase } from '../supabase';

/* =========================
   EXPORT DATABASE (DATA)
========================= */
export async function exportDatabaseData() {
  const [portfolios, transactions, positions, closedPositions, settings] = await Promise.all([
    getPortfolios(),
    getTransactions(),
    getPositions(),
    getClosedPositions(),
    getAllSettings(),
  ]);

  return {
    portfolios,
    transactions,
    positions,
    closedPositions,
    settings,
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0',
  };
}

/* =========================
   EXPORT DATABASE (DOWNLOAD)
========================= */
export async function exportDatabase() {
  const data = await exportDatabaseData();

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================
   VALIDATION BACKUP
========================= */
function isValidBackup(data: any) {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.portfolios) &&
    Array.isArray(data.transactions) &&
    Array.isArray(data.positions) &&
    Array.isArray(data.closedPositions)
  );
}

/* =========================
   IMPORT DATABASE
========================= */
export async function importDatabase(data: any) {
  if (!isValidBackup(data)) {
    throw new Error('Fichier incompatible : structure invalide.');
  }
  if (data.portfolios.length === 0) {
    throw new Error('Fichier invalide : aucun portefeuille trouvé.');
  }

  // Supprimer les anciennes données
  const existingPortfolios = await getPortfolios();
  for (const p of existingPortfolios) {
    await deleteTransactionsByPortfolio(p.id);
    await deletePositionsByPortfolio(p.id);
    await deleteClosedPositionsByPortfolio(p.id);
    await deletePortfolio(p.id);
  }

  // Insérer les nouvelles données
  for (const portfolio of data.portfolios) {
    await createPortfolio(portfolio);
  }
  if (data.transactions?.length > 0) await bulkAddTransactions(data.transactions);
  if (data.positions?.length > 0) await bulkUpsertPositions(data.positions);
  if (data.closedPositions?.length > 0) await bulkAddClosedPositions(data.closedPositions);

  if (Array.isArray(data.settings)) {
    for (const s of data.settings) {
      if (s.key && s.value) await setSetting(s.key, s.value);
    }
  }
}

/* =========================
   AUTO BACKUP VERS FICHIER
   (Chrome/Edge uniquement)
========================= */
export async function pickAutoBackupFile() {
  // @ts-ignore
  if (!window.showSaveFilePicker) {
    throw new Error('Sauvegarde automatique non supportée sur ce navigateur. Utilise Chrome ou Edge.');
  }
  // @ts-ignore
  const handle = await window.showSaveFilePicker({
    suggestedName: 'portfolio-auto-backup.json',
    types: [{ description: 'Backup JSON', accept: { 'application/json': ['.json'] } }],
  });
  return handle as FileSystemFileHandle;
}

async function writeJsonToFile(fileHandle: FileSystemFileHandle, data: unknown) {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

let autoBackupTimer: number | null = null;
let lastWriteAt = 0;

export function startAutoBackupToFile(fileHandle: FileSystemFileHandle, options?: { intervalMs?: number }) {
  stopAutoBackup();
  const intervalMs = options?.intervalMs ?? 5 * 60 * 1000;

  const run = async () => {
    const now = Date.now();
    if (now - lastWriteAt < 3000) return;
    lastWriteAt = now;
    const data = await exportDatabaseData();
    await writeJsonToFile(fileHandle, data);
  };

  run().catch(console.error);
  autoBackupTimer = window.setInterval(() => run().catch(console.error), intervalMs);
}

export function stopAutoBackup() {
  if (autoBackupTimer) { clearInterval(autoBackupTimer); autoBackupTimer = null; }
}

/* =========================
   SETTINGS: AUTO BACKUP
   (stocké dans Supabase settings)
========================= */
export async function saveAutoBackupSetting(fileHandle: FileSystemFileHandle) {
  // On ne peut pas sérialiser un FileSystemFileHandle dans Supabase.
  // On stocke juste le flag "enabled" — le handle est regéré à chaque session.
  await setSetting('autoBackupEnabled', 'true');
  // Stocker le handle en mémoire pour la session courante
  _sessionFileHandle = fileHandle;
}

export async function clearAutoBackupSetting() {
  await setSetting('autoBackupEnabled', 'false');
  _sessionFileHandle = null;
}

let _sessionFileHandle: FileSystemFileHandle | null = null;

export async function loadAutoBackupSetting(): Promise<{
  enabled: boolean;
  fileHandle: FileSystemFileHandle | null;
} | null> {
  const { getSetting } = await import('../db');
  const val = await getSetting('autoBackupEnabled');
  // Le fileHandle n'est pas persistable — il faut re-demander la permission à chaque session
  return {
    enabled: val === 'true',
    fileHandle: _sessionFileHandle,
  };
}