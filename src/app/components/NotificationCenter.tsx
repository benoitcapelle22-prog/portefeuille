import { useState, useEffect, useRef, useMemo } from "react";
import { Bell } from "lucide-react";
import { getLTPlans } from "../db";
import { LTPlanEntry } from "./LTPlanDialog";
import { useQuotes } from "../hooks/useQuotes";

export interface LTNotification {
  id: string;
  date: string;
  planId: string;
  code: string;
  name: string;
  currentPrice: number;
  zone: 1 | 2 | 3;
  alertType: "approche" | "atteinte" | "cible";
  basse: number | null;
  haute: number | null;
  cible: number | null;
  read: boolean;
  createdAt: string;
}

const LS_NOTIFS = "lt_notifications";
const LS_SEEN   = "lt_notifications_seen";
const APPROACH_PCT = 0.05; // 5% au-dessus de la borne haute

function loadNotifs(): LTNotification[] {
  try { return JSON.parse(localStorage.getItem(LS_NOTIFS) ?? "[]"); } catch { return []; }
}
function saveNotifs(n: LTNotification[]) { localStorage.setItem(LS_NOTIFS, JSON.stringify(n)); }

function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_SEEN) ?? "[]")); } catch { return new Set(); }
}
function saveSeen(s: Set<string>) { localStorage.setItem(LS_SEEN, JSON.stringify(Array.from(s))); }

function alertLabel(n: LTNotification) {
  switch (n.alertType) {
    case "approche": return `Approche zone ${n.zone}`;
    case "atteinte": return `Zone ${n.zone} atteinte`;
    case "cible":    return `Cible zone ${n.zone} atteinte`;
  }
}

function fmtP(v: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR");
}

export function NotificationCenter() {
  const [plans, setPlans]             = useState<LTPlanEntry[]>([]);
  const [notifications, setNotifs]    = useState<LTNotification[]>(loadNotifs);
  const [open, setOpen]               = useState(false);
  const dropdownRef                   = useRef<HTMLDivElement>(null);
  const checkedRef                    = useRef<Set<string>>(loadSeen());

  useEffect(() => { getLTPlans().then(setPlans).catch(console.error); }, []);

  const symbols = useMemo(
    () => Array.from(new Set(plans.map(p => p.code.trim().toUpperCase()).filter(Boolean))),
    [plans]
  );
  const { quotesBySymbol } = useQuotes(symbols);

  // ── Détection des alertes à chaque mise à jour des cours ──
  useEffect(() => {
    if (plans.length === 0 || Object.keys(quotesBySymbol).length === 0) return;

    const today   = new Date().toISOString().split("T")[0];
    const seen    = checkedRef.current;
    const newOnes: LTNotification[] = [];

    for (const plan of plans) {
      if (!plan.id) continue;
      const price = quotesBySymbol[plan.code.toUpperCase()]?.price;
      if (!price) continue;

      const zones: [1 | 2 | 3, number | null, number | null, number | null][] = [
        [1, plan.buyZone1Low, plan.buyZone1High, plan.buyZone1Target],
        [2, plan.buyZone2Low, plan.buyZone2High, plan.buyZone2Target],
        [3, plan.buyZone3Low, plan.buyZone3High, plan.buyZone3Target],
      ];

      for (const [zoneNum, z1, z2, cible] of zones) {
        if (z1 == null && z2 == null && cible == null) continue;

        // Bornes effectives indépendamment de l'ordre de saisie
        const haute = z1 != null && z2 != null ? Math.max(z1, z2) : (z1 ?? z2);
        const basse = z1 != null && z2 != null ? Math.min(z1, z2) : null;

        const checks: { type: LTNotification["alertType"]; ok: boolean }[] = [];

        if (haute != null && basse != null) {
          checks.push({ type: "atteinte", ok: price >= basse && price <= haute });
          checks.push({ type: "approche", ok: price > haute && price <= haute * (1 + APPROACH_PCT) });
        } else if (haute != null) {
          checks.push({ type: "approche", ok: price > haute && price <= haute * (1 + APPROACH_PCT) });
        }
        if (cible != null) {
          checks.push({ type: "cible", ok: price <= cible });
        }

        for (const { type, ok } of checks) {
          if (!ok) continue;
          const key = `${plan.id}_z${zoneNum}_${type}_${today}`;
          if (seen.has(key)) continue;
          seen.add(key);
          newOnes.push({
            id: crypto.randomUUID(),
            date: today,
            planId: plan.id,
            code: plan.code,
            name: plan.name,
            currentPrice: price,
            zone: zoneNum,
            alertType: type,
            basse,
            haute,
            cible,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    if (newOnes.length > 0) {
      setNotifs(prev => {
        const merged = [...newOnes, ...prev].slice(0, 100);
        saveNotifs(merged);
        saveSeen(seen);
        return merged;
      });
    } else {
      saveSeen(seen);
    }
  }, [quotesBySymbol, plans]);

  // ── Fermeture au clic extérieur ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Marquer tout comme lu à l'ouverture ──
  const handleOpen = () => {
    setOpen(prev => {
      const next = !prev;
      if (next) {
        // Marquer comme lu en ouvrant
        setNotifs(prev2 => {
          const updated = prev2.map(n => ({ ...n, read: true }));
          saveNotifs(updated);
          return updated;
        });
      }
      return next;
    });
  };

  const markAllRead = () => {
    setNotifs(prev => { const u = prev.map(n => ({ ...n, read: true })); saveNotifs(u); return u; });
  };

  const clearAll = () => {
    setNotifs([]);
    saveNotifs([]);
    checkedRef.current = new Set();
    localStorage.removeItem(LS_SEEN);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bouton cloche */}
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent transition-colors"
        title="Centre de notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panneau */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-84 rounded-md border bg-popover shadow-lg" style={{ width: "22rem" }}>
          {/* En-tête */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Alertes plans LT</span>
              {notifications.length > 0 && (
                <span className="text-xs text-muted-foreground">({notifications.length})</span>
              )}
            </div>
            {notifications.some(n => !n.read) && (
              <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div className="max-h-[26rem] overflow-y-auto divide-y">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune alerte</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-3 py-2.5 text-sm transition-colors ${
                    !n.read ? "bg-muted/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={!n.read ? "font-semibold text-foreground" : "text-muted-foreground"}>
                      {n.name}
                      <span className="font-mono text-xs ml-1 opacity-70">({n.code})</span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(n.date)}</span>
                  </div>
                  <div className={`text-xs mt-0.5 font-medium ${
                    n.alertType === "atteinte" ? "text-emerald-600" :
                    n.alertType === "cible"    ? "text-sky-600"     :
                                                 "text-amber-600"
                  } ${!n.read ? "" : "opacity-70"}`}>
                    {alertLabel(n)} — cours : {fmtP(n.currentPrice)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {n.basse != null || n.haute != null
                      ? `Zone : ${n.basse != null ? fmtP(n.basse) : "—"} – ${n.haute != null ? fmtP(n.haute) : "—"}`
                      : null}
                    {n.cible != null ? `${n.basse != null || n.haute != null ? " · " : ""}Cible : ${fmtP(n.cible)}` : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pied */}
          {notifications.length > 0 && (
            <div className="border-t px-3 py-2">
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                Effacer toutes les alertes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
