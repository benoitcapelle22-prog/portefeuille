// fonction EXPORT
import { db } from "../db";

export async function exportDatabase() {
  const data = {
    portfolios: await db.portfolios.toArray(),
    transactions: await db.transactions.toArray(),
    positions: await db.positions.toArray(),
    closedPositions: await db.closedPositions.toArray(),
    settings: await db.settings.toArray(),
    exportDate: new Date().toISOString(),
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


// fonction IMPORT
export async function importDatabase(file: File) {
  const text = await file.text();
  const data = JSON.parse(text);

  await db.transaction(
    "rw",
    db.portfolios,
    db.transactions,
    db.positions,
    db.closedPositions,
    db.settings,
    async () => {
      await db.portfolios.clear();
      await db.transactions.clear();
      await db.positions.clear();
      await db.closedPositions.clear();
      await db.settings.clear();

      await db.portfolios.bulkAdd(data.portfolios || []);
      await db.transactions.bulkAdd(data.transactions || []);
      await db.positions.bulkAdd(data.positions || []);
      await db.closedPositions.bulkAdd(data.closedPositions || []);
      await db.settings.bulkAdd(data.settings || []);
    }
  );
}