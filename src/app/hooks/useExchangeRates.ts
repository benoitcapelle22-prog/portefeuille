import { useState, useEffect } from 'react';
import { getSetting, setSetting } from "../db";

interface ExchangeRates {
  EUR: number;
  USD: number;
  GBP: number;
  CHF: number;
  JPY: number;
  CAD: number;
}

// Taux de change par défaut (fallback en cas d'échec API)
const DEFAULT_RATES: ExchangeRates = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.05,
  JPY: 0.0062,
  CAD: 0.68,
};

export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const cached = await getSetting('exchangeRates');
if (cached) {
  try {
    const { rates: cachedRates, timestamp } = JSON.parse(cached);
    setRates(cachedRates);
    setLastUpdate(new Date(timestamp));
  } catch {}
}

        // Utiliser l'API ExchangeRate-API (gratuite, sans clé API)
        // Base: EUR, donc on récupère les taux de conversion vers EUR
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
        
        if (!response.ok) {
          throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();

        // L'API retourne les taux depuis EUR vers d'autres devises
        // On doit inverser pour obtenir les taux vers EUR
        const fetchedRates: ExchangeRates = {
          EUR: 1,
          USD: data.rates.USD ? 1 / data.rates.USD : DEFAULT_RATES.USD,
          GBP: data.rates.GBP ? 1 / data.rates.GBP : DEFAULT_RATES.GBP,
          CHF: data.rates.CHF ? 1 / data.rates.CHF : DEFAULT_RATES.CHF,
          JPY: data.rates.JPY ? 1 / data.rates.JPY : DEFAULT_RATES.JPY,
          CAD: data.rates.CAD ? 1 / data.rates.CAD : DEFAULT_RATES.CAD,
        };

        setRates(fetchedRates);
        setLastUpdate(new Date());
        
        // Stocker dans IndexedDB (Dexie settings) pour utilisation hors ligne
        await setSetting('exchangeRates', JSON.stringify({
          rates: fetchedRates,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        console.error('Erreur lors de la récupération des taux de change:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        
        // Essayer de récupérer les derniers taux depuis IndexedDB (Dexie settings)
        const cached = await getSetting('exchangeRates');
        if (cached) {
          try {
            const { rates: cachedRates, timestamp } = JSON.parse(cached);
            setRates(cachedRates);
            setLastUpdate(new Date(timestamp));
          } catch {
            // Si le cache est corrompu, utiliser les taux par défaut
            setRates(DEFAULT_RATES);
          }
        } else {
          // Utiliser les taux par défaut
          setRates(DEFAULT_RATES);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Récupérer les taux immédiatement
    fetchRates();

    // Actualiser les taux toutes les 6 heures
    const interval = setInterval(fetchRates, 6 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Fonction pour obtenir le taux de conversion d'une devise vers EUR
  const getConversionRate = (currency: string): number => {
    return rates[currency as keyof ExchangeRates] || 1;
  };

  return {
    rates,
    isLoading,
    error,
    lastUpdate,
    getConversionRate,
  };
}
