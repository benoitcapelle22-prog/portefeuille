import type { LucideIcon } from "lucide-react";

export type TabNavItem<T extends string> = {
  key: T;
  label: string;
  icon?: LucideIcon;
  /** Classe de couleur optionnelle pour l'icône (ex. "text-emerald-500"). */
  iconClass?: string;
};

type TabNavProps<T extends string> = {
  tabs: TabNavItem<T>[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
};

/**
 * Navigation par onglets partagée par les écrans (Dashboard, Plans de trading,
 * Transactions...). Centralise le style pour éviter que chaque écran réimplémente
 * son propre bloc d'onglets avec de légères variations.
 */
export function TabNav<T extends string>({ tabs, active, onChange, className }: TabNavProps<T>) {
  return (
    <div className={`flex gap-2 border-b${className ? ` ${className}` : ""}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.icon && <t.icon className={`h-4 w-4 ${t.iconClass ?? ""}`} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}
