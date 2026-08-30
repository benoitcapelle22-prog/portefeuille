import { formatCurrency, formatNumber, formatSignedPercent } from "../../utils/format";
import { cn } from "./utils";

type AmountProps = {
  value: number;
  currency?: string;
  digits?: number;
  /** Colore le texte en positif/négatif selon le signe (par défaut : oui). */
  colorize?: boolean;
  /** Affiche un "+" devant les valeurs positives. */
  showSign?: boolean;
  className?: string;
};

/**
 * Affichage standard d'un montant (gain, perte, valorisation...) : formatage
 * fr-FR centralisé + couleur sémantique --positive/--negative selon le signe.
 * À privilégier plutôt que de recomposer `toFixed()` + une classe Tailwind
 * rouge/verte à chaque écran.
 */
export function Amount({ value, currency = "EUR", digits = 2, colorize = true, showSign = false, className }: AmountProps) {
  const text = `${showSign && value > 0 ? "+" : ""}${formatCurrency(value, currency, digits)}`;
  return (
    <span className={cn(colorize && (value >= 0 ? "text-positive" : "text-negative"), className)}>
      {text}
    </span>
  );
}

/** Variante pourcentage (ex. performance) : mêmes règles de couleur et de signe. */
export function PercentAmount({ value, digits = 2, colorize = true, className }: { value: number; digits?: number; colorize?: boolean; className?: string }) {
  return (
    <span className={cn(colorize && (value >= 0 ? "text-positive" : "text-negative"), className)}>
      {formatSignedPercent(value, digits)}
    </span>
  );
}

/** Nombre simple (quantité...) sans devise, sans coloration par défaut. */
export function PlainNumber({ value, digits = 2, className }: { value: number; digits?: number; className?: string }) {
  return <span className={className}>{formatNumber(value, digits)}</span>;
}
