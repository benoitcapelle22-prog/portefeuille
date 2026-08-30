/**
 * Formatage centralisé des nombres, devises et dates affichés dans l'application.
 * Toujours passer par ces fonctions plutôt que par un `.toFixed()` ou un
 * `new Intl.NumberFormat(...)` local à un composant, pour garantir un affichage
 * identique (mêmes décimales, même séparateur) sur tous les écrans.
 */

const LOCALE = "fr-FR";

const numberFormatters = new Map<string, Intl.NumberFormat>();
function getNumberFormatter(minDigits: number, maxDigits: number): Intl.NumberFormat {
  const key = `n:${minDigits}:${maxDigits}`;
  let fmt = numberFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    });
    numberFormatters.set(key, fmt);
  }
  return fmt;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();
function getCurrencyFormatter(currency: string, minDigits: number, maxDigits: number): Intl.NumberFormat {
  const key = `c:${currency}:${minDigits}:${maxDigits}`;
  let fmt = currencyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    });
    currencyFormatters.set(key, fmt);
  }
  return fmt;
}

/** Ex. formatNumber(1234.5) -> "1 234,50" */
export function formatNumber(value: number, digits = 2): string {
  return getNumberFormatter(digits, digits).format(value ?? 0);
}

/** Décimales bornées entre min et max (utile pour les quantités : pas de zéros inutiles). */
export function formatNumberRange(value: number, minDigits: number, maxDigits: number): string {
  return getNumberFormatter(minDigits, maxDigits).format(value ?? 0);
}

/** Ex. formatCurrency(1234.5, "EUR") -> "1 234,50 €" */
export function formatCurrency(value: number, currency = "EUR", digits = 2): string {
  return getCurrencyFormatter(currency, digits, digits).format(value ?? 0);
}

/** Comme formatCurrency, avec un nombre de décimales min/max distinct (ex. cours à 4-6 décimales). */
export function formatCurrencyRange(value: number, currency: string, minDigits: number, maxDigits: number): string {
  return getCurrencyFormatter(currency, minDigits, maxDigits).format(value ?? 0);
}

/** Ex. formatPercent(12.345) -> "12,35 %" */
export function formatPercent(value: number, digits = 2): string {
  return `${formatNumber(value, digits)} %`;
}

/** Ex. formatSignedPercent(3.2) -> "+3,20 %", formatSignedPercent(-3.2) -> "-3,20 %" */
export function formatSignedPercent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)} %`;
}

/** Ex. formatDate("2026-08-30") -> "30/08/2026". Accepte une date ISO (jour) ou un Date. */
export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" && !value.includes("T")
    ? new Date(`${value}T12:00:00`) // évite les décalages de fuseau horaire sur une date sans heure
    : new Date(value);
  return date.toLocaleDateString(LOCALE, options);
}

/** Ex. formatMonthYear("2026-08-30") -> "août 2026" */
export function formatMonthYear(value: string | number | Date): string {
  return formatDate(value, { month: "short", year: "numeric" });
}
