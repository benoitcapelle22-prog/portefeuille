"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" colore le bouton de confirmation en rouge (suppression, remplacement de données...). */
  variant?: "default" | "destructive";
};

type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

let listener: ((request: ConfirmRequest | null) => void) | null = null;

/**
 * Remplace window.confirm() par une boîte de dialogue cohérente avec le design system.
 * Usage : if (!(await confirmDialog({ description: "Supprimer ?", variant: "destructive" }))) return;
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      // Filet de sécurité si <ConfirmDialogHost/> n'est pas monté : on ne bloque pas l'action.
      resolve(window.confirm(options.description));
      return;
    }
    listener({ ...options, resolve });
  });
}

/** À monter une seule fois, en haut de l'arbre (voir App.tsx). */
export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    listener = setRequest;
    return () => {
      listener = null;
    };
  }, []);

  const close = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title ?? "Confirmer l'action"}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {request?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {request?.cancelLabel ?? "Annuler"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={
              request?.variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {request?.confirmLabel ?? "Confirmer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
