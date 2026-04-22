import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Wallet, Plus, Minus, Receipt, TrendingUp } from "lucide-react";
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

interface CashManagerProps {
  cash: number;
  currency: string;
  onUpdateCash: (amount: number, type: "deposit" | "withdrawal" | "fees" | "interests", date: string) => void;
}

export function CashManager({ cash, currency, onUpdateCash }: CashManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"deposit" | "withdrawal" | "fees" | "interests">("deposit");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency
    }).format(value);
  };

  const handleSubmit = () => {
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      alert("Veuillez saisir un montant valide");
      return;
    }

    if ((type === "withdrawal" || type === "fees") && amountValue > cash) {
      alert("Montant insuffisant dans les liquidités");
      return;
    }

    onUpdateCash(amountValue, type, date);
    setAmount("");
    setIsDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Liquidités</CardTitle>
        <Wallet className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold">{formatCurrency(cash)}</div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Gérer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Gérer les liquidités</DialogTitle>
                <DialogDescription>
                  Effectuez un dépôt ou un retrait de liquidités
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="cash-date">Date</Label>
                  <Input
                    id="cash-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cash-type">Type d'opération</Label>
                  <Select value={type} onValueChange={(value: "deposit" | "withdrawal" | "fees" | "interests") => setType(value)}>
                    <SelectTrigger id="cash-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">
                        <div className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-green-600" />
                          Dépôt
                        </div>
                      </SelectItem>
                      <SelectItem value="withdrawal">
                        <div className="flex items-center gap-2">
                          <Minus className="h-4 w-4 text-orange-600" />
                          Retrait
                        </div>
                      </SelectItem>
                      <SelectItem value="fees">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-red-700" />
                          Frais
                        </div>
                      </SelectItem>
                      <SelectItem value="interests">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-teal-600" />
                          Intérêts
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cash-amount">Montant ({currency})</Label>
                  <Input
                    id="cash-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  Liquidités actuelles: <span className="font-medium">{formatCurrency(cash)}</span>
                  <br />
                  Après opération:{" "}
                  <span className={`font-medium ${
                    type === "deposit" || type === "interests" ? "text-green-600" : "text-red-600"
                  }`}>
                    {formatCurrency(
                      type === "deposit" || type === "interests"
                        ? cash + (parseFloat(amount) || 0)
                        : cash - (parseFloat(amount) || 0)
                    )}
                  </span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSubmit}>
                  {{ deposit: "Déposer", withdrawal: "Retirer", fees: "Enregistrer frais", interests: "Enregistrer intérêts" }[type]}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}