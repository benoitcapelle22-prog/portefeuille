import { useState, type ChangeEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Upload, Download, AlertCircle } from "lucide-react";
import { Transaction } from "./TransactionForm";
import { Alert, AlertDescription } from "./ui/alert";

interface ImportTransactionsProps {
  onImportTransactions: (transactions: Omit<Transaction, "id">[]) => void | Promise<void>;
}

export function ImportTransactions({ onImportTransactions }: ImportTransactionsProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>("");
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [report, setReport] = useState<string>("");

  const fields = [
    { key: "portfolioCode", label: "Code portefeuille", required: false },
    { key: "date", label: "Date", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Nom", required: true },
    { key: "sector", label: "Secteur", required: false },
    { key: "type", label: "Type", required: true },
    { key: "quantity", label: "Quantité", required: true },
    { key: "unitPrice", label: "Cours", required: true },
    { key: "currency", label: "Devise", required: false },
    { key: "conversionRate", label: "Taux de conversion", required: false },
    { key: "fees", label: "Frais", required: false },
    { key: "tff", label: "TFF", required: false },
  ];

  const resetForm = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setMapping({});
    setError("");
    setReport("");
    setStep("upload");
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const buildValidationReport = (txs: Omit<Transaction, "id">[]) => {
    const lines: string[] = [];
    const boughtQtyByCode = new Map<string, number>();
    const add = (s: string) => lines.push(s);

    txs.forEach((t, i) => {
      const lineNo = i + 2;
      const code = (t.code || "").trim().toUpperCase();

      if (!t.date || !code) {
        add(`Ligne ${lineNo}: code/date manquant(s).`);
        return;
      }
      if (!Number.isFinite(t.quantity) || t.quantity <= 0) {
        add(`Ligne ${lineNo} (${code}): quantité invalide (${t.quantity}).`);
        return;
      }

      const prev = boughtQtyByCode.get(code) ?? 0;

      if (t.type === "achat") {
        boughtQtyByCode.set(code, prev + t.quantity);
      }

      if (t.type === "vente") {
        if (prev <= 0) {
          add(`Ligne ${lineNo} (${code}): ⚠️ VENTE sans achat préalable dans ce fichier (position existante ?).`);
        } else if (t.quantity > prev) {
          add(`Ligne ${lineNo} (${code}): ⚠️ VENTE (${t.quantity}) > achats cumulés dans ce fichier (${prev}).`);
        }
        boughtQtyByCode.set(code, Math.max(0, prev - t.quantity));
      }
    });

    if (lines.length === 0) return "✅ Aucun problème détecté dans le fichier.";
    return ["⚠️ Rapport de pré-contrôle (informatif uniquement, l'import continue)", ...lines].join("\n");
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Le fichier doit être au format CSV");
      return;
    }

    setFile(selectedFile);
    setError("");
    setReport("");

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(selectedFile);
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length === 0) {
      setError("Le fichier CSV est vide");
      return;
    }

    const parsedHeaders = lines[0].split(/[,;|\t]/).map((h) => h.trim());
    const data = lines.slice(1, 6).map((line) =>
      line.split(/[,;|\t]/).map((cell) => cell.trim())
    );

    setHeaders(parsedHeaders);
    setPreview(data);

    const autoMapping: Record<string, string> = {};
    parsedHeaders.forEach((header, index) => {
      const lowerHeader = header.toLowerCase();
      if (lowerHeader.includes("portefeuille") || lowerHeader.includes("portfolio"))
        autoMapping["portfolioCode"] = index.toString();
      if (lowerHeader.includes("date")) autoMapping["date"] = index.toString();
      if (lowerHeader.includes("code") || lowerHeader.includes("ticker") || lowerHeader.includes("symbol"))
        autoMapping["code"] = index.toString();
      if (lowerHeader.includes("nom") || lowerHeader.includes("name") || lowerHeader.includes("libellé"))
        autoMapping["name"] = index.toString();
      if (lowerHeader.includes("secteur") || lowerHeader.includes("sector") || lowerHeader.includes("activité"))
        autoMapping["sector"] = index.toString();
      if (lowerHeader.includes("type") || lowerHeader.includes("opération"))
        autoMapping["type"] = index.toString();
      if (
        lowerHeader.includes("quantité") ||
        lowerHeader.includes("quantity") ||
        lowerHeader.includes("qté") ||
        lowerHeader.includes("nombre")
      )
        autoMapping["quantity"] = index.toString();
      if (lowerHeader.includes("prix") || lowerHeader.includes("price") || lowerHeader.includes("cours"))
        autoMapping["unitPrice"] = index.toString();
      if (lowerHeader.includes("devise") || lowerHeader.includes("currency"))
        autoMapping["currency"] = index.toString();
      if (lowerHeader.includes("taux") || lowerHeader.includes("rate") || lowerHeader.includes("conversion"))
        autoMapping["conversionRate"] = index.toString();
      if (lowerHeader.includes("frais") || lowerHeader.includes("fees") || lowerHeader.includes("commission"))
        autoMapping["fees"] = index.toString();
      if (lowerHeader.includes("tff")) autoMapping["tff"] = index.toString();
    });

    setMapping(autoMapping);
    setStep("mapping");
  };

  const handleImport = () => {
    try {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());
        const data = lines.slice(1).map((line) =>
          line.split(/[,;|\t]/).map((cell) => cell.trim())
        );

        const transactions: Omit<Transaction, "id">[] = data
          .map((row) => {
            const getField = (key: string, defaultValue: any = "") => {
              const index = mapping[key];
              if (index === undefined || index === "" || index === "__NONE__") return defaultValue;
              return row[parseInt(index)] || defaultValue;
            };

            let type = getField("type", "achat").toLowerCase();
            if (type.includes("achat") || type.includes("buy") || type.includes("purchase")) type = "achat";
            else if (type.includes("vente") || type.includes("sell") || type.includes("sale")) type = "vente";
            else if (type.includes("dividende") || type.includes("dividend")) type = "dividende";
            else if (type.includes("depot") || type.includes("deposit")) type = "depot";
            else if (type.includes("retrait") || type.includes("withdrawal")) type = "retrait";

            return {
              date: getField("date"),
              code: (getField("code") || "").trim().toUpperCase(),
              name: (getField("name") || "").trim(),
              type: type as "achat" | "vente" | "dividende" | "depot" | "retrait",
              quantity: parseFloat(getField("quantity", "0").replace(",", ".")) || 0,
              unitPrice: parseFloat(getField("unitPrice", "0").replace(",", ".")) || 0,
              fees: parseFloat(getField("fees", "0").replace(",", ".")) || 0,
              tff: parseFloat(getField("tff", "0").replace(",", ".")) || 0,
              currency: getField("currency", "EUR") as
                | "EUR"
                | "USD"
                | "GBP"
                | "CHF"
                | "JPY"
                | "CAD"
                | "DKK"
                | "SEK",
              conversionRate: parseFloat(getField("conversionRate", "1").replace(",", ".")) || 1,
            };
          })
          .filter((t) => t.code && t.date);

        // Trier par date avant import (achats avant ventes à date égale)
        const sorted = [...transactions].sort((a, b) => {
          const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          // À date égale : achats en premier
          if (a.type === "achat" && b.type !== "achat") return -1;
          if (a.type !== "achat" && b.type === "achat") return 1;
          return 0;
        });

        // Rapport informatif uniquement — ne bloque PAS l'import
        const rep = buildValidationReport(sorted);
        setReport(rep);
        setError("");

        try {
          await onImportTransactions(sorted);
          setOpen(false);
          resetForm();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError("Import échoué: " + msg);
          setReport((prev) => prev + "\n\n❌ Erreur lors de l'application dans l'app :\n" + msg);
        }
      };

      reader.readAsText(file);
    } catch (err) {
      setError("Erreur lors de l'import: " + (err as Error).message);
    }
  };

  const downloadTemplate = () => {
    const csvContent =
      "code_portefeuille,date,code,nom,secteur,type,nombre,cours,devise,taux_conversion,frais,tff\n" +
      "PEA,2024-01-15,AAPL,Apple Inc.,Technologie,achat,10,175.50,USD,0.92,5.00,0.00\n" +
      "PEA,2024-01-20,GOOGL,Alphabet Inc.,Technologie,achat,5,140.25,USD,0.92,3.00,0.00\n" +
      "CTO,2024-02-10,MC.PA,LVMH,Luxe,achat,2,750.00,EUR,1.00,10.00,6.00\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_transactions.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Importer des transactions
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer des transactions depuis un fichier CSV</DialogTitle>
          <DialogDescription>Importez plusieurs transactions à la fois depuis un fichier CSV</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {report && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Rapport</Label>
                <Button variant="outline" onClick={() => downloadText("rapport_import.txt", report)}>
                  Télécharger le rapport
                </Button>
              </div>
              <pre className="whitespace-pre-wrap rounded-md border p-3 text-sm">{report}</pre>
            </div>
          )}

          {step === "upload" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="csv-file">Fichier CSV</Label>
                <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} />
                <p className="text-sm text-muted-foreground">
                  Le fichier doit contenir au minimum les colonnes : date, code, nom, type, quantité, prix unitaire
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                  <Download className="h-4 w-4" />
                  Télécharger un modèle CSV
                </Button>
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <h4 className="font-medium">Mapper les colonnes du fichier CSV</h4>
                <p className="text-sm text-muted-foreground">
                  Associez chaque colonne de votre fichier aux champs requis
                </p>

                {fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <Label className="w-40">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </Label>

                    <Select
                      value={mapping[field.key] && mapping[field.key] !== "" ? mapping[field.key] : "__NONE__"}
                      onValueChange={(value) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: value === "__NONE__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Sélectionner une colonne" />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="__NONE__">-- Aucune --</SelectItem>
                        {headers.map((header, index) => (
                          <SelectItem key={index} value={String(index)}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>

          {step === "upload" && file && <Button onClick={() => setStep("mapping")}>Continuer</Button>}

          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Retour
              </Button>
              <Button onClick={handleImport}>Importer</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}