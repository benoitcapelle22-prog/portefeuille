# Migration vers IndexedDB avec Dexie - DOCUMENTATION

## ✅ Ce qui a été fait

### 1. Installation des packages
- `dexie` : Bibliothèque de base de données IndexedDB
- `dexie-react-hooks` : Hooks React pour Dexie

### 2. Création de la structure de base de données (`/src/app/db.ts`)

**Tables créées :**
- `portfolios` : Stocke les portefeuilles avec leurs paramètres
- `transactions` : Toutes les transactions (achats, ventes, dividendes, dépôts, retraits)
- `positions` : Positions en cours par portefeuille
- `closedPositions` : Positions clôturées par portefeuille
- `settings` : Paramètres globaux (portefeuille courant, etc.)

**Fonction de migration automatique :**
La fonction `migrateFromLocalStorage()` migre automatiquement toutes les données depuis localStorage vers IndexedDB au premier chargement.

### 3. Modifications du PortfolioLayout.tsx

**Chargement des données :**
- Utilisation de `useLiveQuery()` pour charger les données en temps réel depuis IndexedDB
- Les données se mettent à jour automatiquement dans l'UI quand la base change

**Fonctions migrées vers Dexie :**
- `handleCreatePortfolio` : Utilise `db.portfolios.add()`
- `handleUpdatePortfolio` : Utilise `db.portfolios.update()`
- `handleDeletePortfolio` : Supprime dans toutes les tables concernées
- `updateCurrentPortfolioData` : Met à jour transactions, positions et positions clôturées

## ⚠️ Ce qui reste à finaliser

Le fichier PortfolioLayout.tsx contient encore des références à `setPortfolios()` et `setPortfolioData()` qui étaient utilisées avec useState. Ces fonctions doivent être remplacées par des appels directs à Dexie :

### Fonctions à migrer :
1. **handlePurchase** - Lignes ~400-450
2. **handleSale** - Lignes ~450-550
3. **handleDividend** - Lignes ~550-600
4. **handleUpdateCash** - Ligne ~750
5. **handleUpdateStopLoss** - Lignes ~660-710
6. **handleUpdateCurrentPrice** - Lignes ~710-760

Ces fonctions utilisent encore :
```typescript
setPortfolios([...]) // À remplacer par db.portfolios.update()
setPortfolioData({...}) // À remplacer par db.transactions/positions/closedPositions.bulkAdd/update
```

## 📊 Structure complète de la base de données

### Table: portfolios
```typescript
{
  id: string (PK),
  name: string,
  code?: string,
  category: "Trading" | "Crypto" | "LT",
  currency: "EUR" | "USD",
  fees: { defaultFees: number, defaultTFF: number },
  cash: number
}
```

### Table: transactions
```typescript
{
  id: string (PK),
  portfolioId: string (FK),
  date: string,
  code: string,
  name: string,
  type: "achat" | "vente" | "dividende" | "depot" | "retrait",
  quantity: number,
  unitPrice: number,
  fees: number,
  tff: number,
  currency: string,
  conversionRate: number,
  tax?: number
}
```

### Table: positions
```typescript
{
  id?: number (PK auto),
  portfolioId: string (FK),
  code: string,
  name: string,
  quantity: number,
  totalCost: number,
  pru: number,
  currency?: string,
  manualCurrentPrice?: number,
  stopLoss?: number
}
```

### Table: closedPositions
```typescript
{
  id?: number (PK auto),
  portfolioId: string (FK),
  code: string,
  name: string,
  purchaseDate: string,
  saleDate: string,
  quantity: number,
  pru: number,
  averageSalePrice: number,
  totalPurchase: number,
  totalSale: number,
  gainLoss: number,
  gainLossPercent: number,
  dividends?: number
}
```

### Table: settings
```typescript
{
  key: string (PK),
  value: string
}
```

## 🔄 Migration automatique

Au premier lancement, l'application :
1. Vérifie si des données existent dans localStorage
2. Les migre automatiquement vers IndexedDB
3. Marque la migration comme effectuée
4. Les données localStorage restent intactes (backup)

## 🎯 Avantages de la migration

1. **Stockage illimité** : IndexedDB n'a pas de limite de 5-10 MB comme localStorage
2. **Performance** : Requêtes indexées et optimisées
3. **Réactivité** : Mise à jour automatique de l'UI avec useLiveQuery
4. **Transactions ACID** : Intégrité des données garantie
5. **Requêtes complexes** : Filtres, tris, jointures possibles
6. **Hors ligne** : Fonctionne sans connexion internet

## 🚀 Prochaines étapes

Pour finaliser la migration, il faut :
1. Remplacer tous les `setPortfolios()` par des `db.portfolios.update(id, data)`
2. Remplacer tous les `setPortfolioData()` par des appels à `db.transactions/positions/closedPositions`
3. Supprimer les références à localStorage restantes
4. Tester toutes les fonctionnalités (achats, ventes, dividendes, etc.)
