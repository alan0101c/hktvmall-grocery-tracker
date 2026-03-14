import { useState } from "react";
import { Plus, Trash2, Loader2, Layers, Info } from "lucide-react";
import {
  useGetProductTypes,
  useCreateProductType,
  useDeleteProductType,
  getGetProductTypesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const COMMON_UNITS = ["ml", "g", "kg", "L", "tablet", "capsule", "sachet", "pack", "sheet", "piece"];

export default function ProductTypesPage() {
  const [name, setName] = useState("");
  const [unitLabel, setUnitLabel] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: types = [], isLoading } = useGetProductTypes();
  const createMutation = useCreateProductType();
  const deleteMutation = useDeleteProductType();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unitLabel.trim()) return;
    createMutation.mutate(
      { data: { name: name.trim(), unitLabel: unitLabel.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
          toast({ title: "Category created", description: `"${name}" will appear in the Add Product flow.` });
          setName("");
          setUnitLabel("");
        },
        onError: () => {
          toast({ title: "Failed to create", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number, typeName: string) => {
    if (!confirm(`Remove category "${typeName}"? Products using it won't be deleted.`)) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
          toast({ title: "Category removed" });
        },
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Product Categories</h1>
        <p className="text-muted-foreground mt-1">
          Define categories and their measurement units to enable price-per-unit comparisons.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-8 text-sm text-blue-800">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-semibold">How it works</p>
          <p className="text-blue-700 mt-0.5">
            After adding a product, you can assign it a category and package size. The app then calculates a
            unit price (e.g. <span className="font-mono bg-blue-100 px-1 rounded">$0.042/ml</span>) so you can
            compare value across brands and pack sizes.
          </p>
        </div>
      </div>

      {/* Create form */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm mb-6">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> New Category
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Category name (e.g. Shampoo, Mouthwash)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground text-sm"
            required
          />
          <div className="flex gap-2">
            <select
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              className="px-3 py-2.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary transition-all text-sm text-foreground"
            >
              <option value="">Select unit</option>
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="or type..."
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              className="w-28 px-3 py-2.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending || !name.trim() || !unitLabel.trim()}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:transform-none transition-all text-sm"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </form>
      </div>

      {/* Categories list */}
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : types.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center px-4 bg-card border border-dashed border-border/50 rounded-3xl">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Layers className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-1">No categories yet</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            Create a category above to start comparing products by unit price.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {types.map((type) => (
            <div
              key={type.id}
              className="flex items-center gap-4 px-5 py-4 bg-card border border-border rounded-2xl shadow-sm"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground text-sm">{type.name}</p>
                <p className="text-xs text-muted-foreground">Measured per <span className="font-mono text-foreground bg-muted px-1 rounded">{type.unitLabel}</span></p>
              </div>
              <button
                onClick={() => handleDelete(type.id, type.name)}
                disabled={deleteMutation.isPending}
                className={cn(
                  "p-2 rounded-lg transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                  deleteMutation.isPending && "opacity-50"
                )}
                title="Delete category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
