import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "./ui/dialog";
import { Plus, Trash2, Settings, Edit, Wallet } from "lucide-react";

export interface PortfolioFees {
  defaultFeesPercent: number; // Pourcentage des frais
  defaultFeesMin: number; // Minimum des frais
  defaultTFF: number;
}

export interface Portfolio {
  id: string;
  name: string;
  code?: string; // Code du portefeuille (ex: PEA, CTO, etc.)
  category: "Trading" | "Crypto" | "LT";
  currency: "EUR" | "USD" | "DKK" | "SEK";
  fees: PortfolioFees;
  cash?: number; // Liquidités disponibles
}

interface PortfolioSelectorProps {
  portfolios: Portfolio[];
  currentPortfolioId: string | null;
  onSelectPortfolio: (id: string) => void;
  onCreatePortfolio: (portfolio: Omit<Portfolio, "id">) => void;
  onUpdatePortfolio: (id: string, portfolio: Omit<Portfolio, "id">) => void;
  onDeletePortfolio: (id: string) => void;
}

export function PortfolioSelector({
  portfolios,
  currentPortfolioId,
  onSelectPortfolio,
  onCreatePortfolio,
  onUpdatePortfolio,
  onDeletePortfolio,
}: PortfolioSelectorProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isListDialogOpen, setIsListDialogOpen] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    category: "Trading" as const,
    currency: "EUR" as const,
    defaultFeesPercent: "0",
    defaultFeesMin: "0",
    defaultTFF: "0",
  });

  const currentPortfolio = portfolios?.find(p => p.id === currentPortfolioId);

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      category: "Trading",
      currency: "EUR",
      defaultFeesPercent: "0",
      defaultFeesMin: "0",
      defaultTFF: "0",
    });
  };

  const loadCurrentPortfolio = () => {
    if (currentPortfolio) {
      setFormData({
        name: currentPortfolio.name,
        code: currentPortfolio.code || "",
        category: currentPortfolio.category,
        currency: currentPortfolio.currency,
        defaultFeesPercent: (currentPortfolio.fees.defaultFeesPercent ?? 0).toString(),
        defaultFeesMin: (currentPortfolio.fees.defaultFeesMin ?? 0).toString(),
        defaultTFF: (currentPortfolio.fees.defaultTFF ?? 0).toString(),
      });
    }
  };

  const loadPortfolioForEdit = (portfolioId: string) => {
    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (portfolio) {
      setEditingPortfolioId(portfolioId);
      setFormData({
        name: portfolio.name,
        code: portfolio.code || "",
        category: portfolio.category,
        currency: portfolio.currency,
        defaultFeesPercent: (portfolio.fees.defaultFeesPercent ?? 0).toString(),
        defaultFeesMin: (portfolio.fees.defaultFeesMin ?? 0).toString(),
        defaultTFF: (portfolio.fees.defaultTFF ?? 0).toString(),
      });
      setIsListDialogOpen(false);
      setIsEditDialogOpen(true);
    }
  };

  const handleDeletePortfolioFromList = (portfolioId: string) => {
    if (portfolios.length <= 1) {
      alert("Vous devez conserver au moins un portefeuille");
      return;
    }

    if (confirm("Êtes-vous sûr de vouloir supprimer ce portefeuille et toutes ses données ?")) {
      onDeletePortfolio(portfolioId);
    }
  };

  const handleCreatePortfolio = () => {
    if (!formData.name.trim()) {
      alert("Veuillez saisir un nom pour le portefeuille");
      return;
    }

    onCreatePortfolio({
      name: formData.name.trim(),
      code: formData.code.trim(),
      category: formData.category,
      currency: formData.currency,
      fees: {
        defaultFeesPercent: parseFloat(formData.defaultFeesPercent) || 0,
        defaultFeesMin: parseFloat(formData.defaultFeesMin) || 0,
        defaultTFF: parseFloat(formData.defaultTFF) || 0,
      },
    });
    resetForm();
    setIsCreateDialogOpen(false);
  };

  const handleUpdatePortfolio = () => {
    const portfolioIdToUpdate = editingPortfolioId || currentPortfolioId;
    if (!portfolioIdToUpdate || !formData.name.trim()) {
      alert("Veuillez saisir un nom pour le portefeuille");
      return;
    }

    onUpdatePortfolio(portfolioIdToUpdate, {
      name: formData.name.trim(),
      code: formData.code.trim(),
      category: formData.category,
      currency: formData.currency,
      fees: {
        defaultFeesPercent: parseFloat(formData.defaultFeesPercent) || 0,
        defaultFeesMin: parseFloat(formData.defaultFeesMin) || 0,
        defaultTFF: parseFloat(formData.defaultTFF) || 0,
      },
    });
    setIsEditDialogOpen(false);
    setEditingPortfolioId(null);
  };

  const handleDeletePortfolio = () => {
    if (portfolios.length <= 1) {
      alert("Vous devez conserver au moins un portefeuille");
      return;
    }

    if (!currentPortfolioId) return;

    if (confirm("Êtes-vous sûr de vouloir supprimer ce portefeuille et toutes ses données ?")) {
      onDeletePortfolio(currentPortfolioId);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="portfolio-select" className="sr-only">
          Sélectionner un portefeuille
        </Label>
        <Select
          value={currentPortfolioId || undefined}
          onValueChange={onSelectPortfolio}
        >
          <SelectTrigger id="portfolio-select" className="w-full">
            <SelectValue placeholder="Sélectionner un portefeuille" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">
              📊 Tous les portefeuilles (Vue consolidée)
            </SelectItem>
            {portfolios.map((portfolio) => (
              <SelectItem key={portfolio.id} value={portfolio.id}>
                {portfolio.code ? `[${portfolio.code}] ` : ''}{portfolio.name} ({portfolio.category} - {portfolio.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bouton Créer */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" onClick={resetForm}>
            <Plus className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer un nouveau portefeuille</DialogTitle>
            <DialogDescription>
              Configurez votre nouveau portefeuille avec ses paramètres spécifiques.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-portfolio-name">Nom du portefeuille</Label>
              <Input
                id="create-portfolio-name"
                placeholder="Ex: PEA, Compte-titres, Crypto..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-portfolio-code">Code du portefeuille</Label>
              <Input
                id="create-portfolio-code"
                placeholder="Ex: PEA, CTO, etc..."
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-category">Catégorie</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: "Trading" | "Crypto" | "LT") =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger id="create-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Trading">Trading</SelectItem>
                    <SelectItem value="Crypto">Crypto</SelectItem>
                    <SelectItem value="LT">Long Terme</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-currency">Devise</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value: "EUR" | "USD" | "DKK" | "SEK") =>
                    setFormData({ ...formData, currency: value })
                  }
                >
                  <SelectTrigger id="create-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="DKK">DKK (kr)</SelectItem>
                    <SelectItem value="SEK">SEK (kr)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Frais par défaut</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-fees" className="text-sm text-muted-foreground">
                    Frais (%)
                  </Label>
                  <Input
                    id="create-fees"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.defaultFeesPercent}
                    onChange={(e) => setFormData({ ...formData, defaultFeesPercent: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-fees-min" className="text-sm text-muted-foreground">
                    Minimum (€)
                  </Label>
                  <Input
                    id="create-fees-min"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.defaultFeesMin}
                    onChange={(e) => setFormData({ ...formData, defaultFeesMin: e.target.value })}
                  />
                </div>

                {formData.currency === "EUR" && (
                  <div className="space-y-2">
                    <Label htmlFor="create-tff" className="text-sm text-muted-foreground">
                      TFF (%)
                    </Label>
                    <Input
                      id="create-tff"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.defaultTFF}
                      onChange={(e) => setFormData({ ...formData, defaultTFF: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreatePortfolio}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bouton Paramètres */}
      {currentPortfolioId && (
        <>
          {/* Dialog de liste de tous les portefeuilles */}
          <Dialog open={isListDialogOpen} onOpenChange={setIsListDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Wallet className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[85vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Liste des portefeuilles</DialogTitle>
                <DialogDescription>
                  Consultez tous vos portefeuilles et leurs caractéristiques.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left text-sm font-medium whitespace-nowrap">Nom</th>
                        <th className="px-3 py-2 text-left text-sm font-medium whitespace-nowrap">Code</th>
                        <th className="px-3 py-2 text-left text-sm font-medium whitespace-nowrap">Catégorie</th>
                        <th className="px-3 py-2 text-left text-sm font-medium whitespace-nowrap">Devise</th>
                        <th className="px-3 py-2 text-left text-sm font-medium whitespace-nowrap">Frais</th>
                        <th className="px-3 py-2 text-left text-sm font-medium whitespace-nowrap">TFF (%)</th>
                        <th className="px-3 py-2 text-center text-sm font-medium whitespace-nowrap w-32">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolios.map((portfolio) => (
                        <tr key={portfolio.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2 text-sm whitespace-nowrap">{portfolio.name}</td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">{portfolio.code || '-'}</td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                              {portfolio.category === 'LT' ? 'Long Terme' : portfolio.category}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">{portfolio.currency}</td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">
                            {portfolio.fees.defaultFeesPercent != null ? portfolio.fees.defaultFeesPercent.toFixed(2) : '0.00'} %
                          </td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">
                            {portfolio.currency === 'EUR' ? (portfolio.fees.defaultTFF != null ? portfolio.fees.defaultTFF.toFixed(2) : '0.00') : '-'}
                          </td>
                          <td className="px-3 py-2 w-32">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => loadPortfolioForEdit(portfolio.id)}
                                title="Modifier"
                              >
                                <Edit className="size-4" />
                              </Button>
                              {portfolios.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePortfolioFromList(portfolio.id)}
                                  title="Supprimer"
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Dialog d'édition d'un portefeuille */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Paramètres du portefeuille</DialogTitle>
                <DialogDescription>
                  Modifiez les paramètres de votre portefeuille.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-portfolio-name">Nom du portefeuille</Label>
                  <Input
                    id="edit-portfolio-name"
                    placeholder="Ex: PEA, Compte-titres, Crypto..."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-portfolio-code">Code du portefeuille</Label>
                  <Input
                    id="edit-portfolio-code"
                    placeholder="Ex: PEA, CTO, etc..."
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Catégorie</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value: "Trading" | "Crypto" | "LT") =>
                        setFormData({ ...formData, category: value })
                      }
                    >
                      <SelectTrigger id="edit-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Trading">Trading</SelectItem>
                        <SelectItem value="Crypto">Crypto</SelectItem>
                        <SelectItem value="LT">Long Terme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-currency">Devise</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value: "EUR" | "USD" | "DKK" | "SEK") =>
                        setFormData({ ...formData, currency: value })
                      }
                    >
                      <SelectTrigger id="edit-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="DKK">DKK (kr)</SelectItem>
                        <SelectItem value="SEK">SEK (kr)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Frais par défaut</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-fees" className="text-sm text-muted-foreground">
                        Frais (%)
                      </Label>
                      <Input
                        id="edit-fees"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.defaultFeesPercent}
                        onChange={(e) => setFormData({ ...formData, defaultFeesPercent: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-fees-min" className="text-sm text-muted-foreground">Minimum ($)</Label>
                      <Input
                        id="edit-fees-min"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.defaultFeesMin}
                        onChange={(e) => setFormData({ ...formData, defaultFeesMin: e.target.value })}
                      />
                    </div>

                    {formData.currency === "EUR" && (
                      <div className="space-y-2">
                        <Label htmlFor="edit-tff" className="text-sm text-muted-foreground">
                          TFF (%)
                        </Label>
                        <Input
                          id="edit-tff"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.defaultTFF}
                          onChange={(e) => setFormData({ ...formData, defaultTFF: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleUpdatePortfolio}>Enregistrer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Bouton Supprimer */}
      {portfolios.length > 1 && currentPortfolioId && (
        <Button
          variant="outline"
          size="icon"
          onClick={handleDeletePortfolio}
          title="Supprimer ce portefeuille"
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}