// backup.ts

import { db } from "../db";

/* =========================
   EXPORT DATABASE
========================= */

export async function exportDatabase() {
  const data = {
    portfolios: await db.portfolios.toArray(),
    transactions: await db.transactions.toArray(),
    positions: await db.positions.toArray(),
    closedPositions: await db.closedPositions.toArray(),
    settings: await db.settings.toArray(),
    exportDate: new Date().toISOString(),
    appVersion: "1.0.0",
  };

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
  // 🔴 Vérification structure
  if (!isValidBackup(data)) {
    throw new Error(
      "Fichier incompatible : structure invalide (données manquantes)."
    );
  }

  // 🔴 Vérification minimale
  if (data.portfolios.length === 0) {
    throw new Error(
      "Fichier invalide : aucun portefeuille trouvé dans le backup."
    );
  }

  try {
    await db.transaction("rw", db.tables, async () => {
      // 1️⃣ Tout vider
      await Promise.all(db.tables.map((table) => table.clear()));

      // 2️⃣ Réinsérer les données
      await db.portfolios.bulkAdd(data.portfolios);
      await db.transactions.bulkAdd(data.transactions);
      await db.positions.bulkAdd(data.positions);
      await db.closedPositions.bulkAdd(data.closedPositions);
      await db.settings.bulkAdd(data.settings);
    });
  } catch (error) {
    throw new Error(
      "Import échoué : erreur lors de l'écriture dans la base locale."
    );
  }
}