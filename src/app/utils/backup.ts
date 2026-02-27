// backup.ts
import { db } from "../db";

/* =========================
   HELPER: settings keyPath
========================= */
function makeSettingRecord(settingKey: string, payload: Record<string, any>) {
  const keyPath = db.settings.schema.primKey.keyPath;

  if (typeof keyPath !== "string" || !keyPath) {
    throw new Error("Table settings: clé primaire introuvable.");
  }

  return { [keyPath]: settingKey, ...payload };
}

/* =========================
   EXPORT DATABASE (DATA)
========================= */
export async function exportDatabaseData() {
  const data = {
    portfolios: await db.portfolios.toArray(),
    transactions: await db.transactions.toArray(),
    positions: await db.positions.toArray(),
    closedPositions: await db.closedPositions.toArray(),
    settings: await db.settings.toArray(),
    exportDate: new Date().toISOString(),
    appVersion: "1.0.0",
  };

  return data;
}

/* =========================
   EXPORT DATABASE (DOWNLOAD)
========================= */
export async function exportDatabase() {
  const data = await exportDatabaseData();

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
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
    typeof data === "object" &&
    Array.isArray(data.portfolios) &&
    Array.isArray(data.transactions) &&
    Array.isArray(data.positions) &&
    Array.isArray(data.closedPositions) &&
    Array.isArray(data.settings)
  );
}

/* =========================
   IMPORT DATABASE (SECURISÉ)
========================= */
export async function importDatabase(data: any) {
  if (!isValidBackup(data)) {
    throw new Error(
      "Fichier incompatible : structure invalide (données manquantes)."
    );
  }

  if (data.portfolios.length === 0) {
    throw new Error(
      "Fichier invalide : aucun portefeuille trouvé dans le backup."
    );
  }

  try {
    await db.transaction("rw", db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()));

      await db.portfolios.bulkAdd(data.portfolios);
      await db.transactions.bulkAdd(data.transactions);
      await db.positions.bulkAdd(data.positions);
      await db.closedPositions.bulkAdd(data.closedPositions);
      await db.settings.bulkAdd(data.settings);
    });
  } catch {
    throw new Error(
      "Import échoué : erreur lors de l'écriture dans la base locale."
    );
  }
}

/* =========================
   AUTO BACKUP VERS FICHIER
   (Chrome/Edge uniquement)
========================= */
export async function pickAutoBackupFile() {
  // @ts-ignore
  if (!window.showSaveFilePicker) {
    throw new Error(
      "Sauvegarde automatique non supportée sur ce navigateur. Utilise Chrome ou Edge."
    );
  }

  // @ts-ignore
  const handle = await window.showSaveFilePicker({
    suggestedName: "portfolio-auto-backup.json",
    types: [
      {
        description: "Backup JSON",
        accept: { "application/json": [".json"] },
      },
    ],
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

export function startAutoBackupToFile(
  fileHandle: FileSystemFileHandle,
  options?: { intervalMs?: number }
) {
  stopAutoBackup();

  const intervalMs = options?.intervalMs ?? 5 * 60 * 1000; // 5 minutes

  const run = async () => {
    const now = Date.now();
    if (now - lastWriteAt < 3000) return;
    lastWriteAt = now;

    const data = await exportDatabaseData();
    await writeJsonToFile(fileHandle, data);
  };

  run().catch(console.error);
  autoBackupTimer = window.setInterval(() => {
    run().catch(console.error);
  }, intervalMs);
}

export function stopAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}

/* =========================
   SETTINGS: AUTO BACKUP
========================= */
export async function saveAutoBackupSetting(fileHandle: FileSystemFileHandle) {
  await db.settings.put(
    makeSettingRecord("autoBackup", { enabled: true, fileHandle })
  );
}

export async function clearAutoBackupSetting() {
  await db.settings.put(
    makeSettingRecord("autoBackup", { enabled: false, fileHandle: null })
  );
}

export async function loadAutoBackupSetting(): Promise<{
  enabled: boolean;
  fileHandle: FileSystemFileHandle | null;
} | null> {
  const setting: any = await db.settings.get("autoBackup");
  if (!setting) return null;

  return {
    enabled: !!setting.enabled,
    fileHandle: (setting.fileHandle as FileSystemFileHandle) ?? null,
  };
}