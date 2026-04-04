import { useState } from "react";
import { Plus, Trash2, Loader2, Layers, Info, Pencil, X, Check, Package, ChevronDown, ChevronUp } from "lucide-react";
import {
  useGetProductTypes,
  useCreateProductType,
  useDeleteProductType,
  useUpdateProductType,
  useUpdateProductUnit,
  useGetProducts,
  getGetProductTypesQueryKey,
  getGetProductsQueryKey,
} from "@workspace/api-client-react";
import type { ProductType, Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const COMMON_UNITS = ["ml", "g", "kg", "L", "tablet", "capsule", "sachet", "pack", "sheet", "piece"];

function UnitPicker({
  value,
  onChange,
  placeholder = "or type...",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2", className)}>
      <select
        value={COMMON_UNITS.includes(value) ? value : ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="px-3 py-2 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary transition-all text-sm text-foreground"
      >
        <option value="">Select unit</option>
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 px-3 py-2 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground text-sm"
        required
      />
    </div>
  );
}

function ProductPackageRow({
  product,
  unitLabel,
}: {
  product: Product;
  unitLabel: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateUnit = useUpdateProductUnit();
  const [qty, setQty] = useState<string>(
    product.packageQuantity != null ? String(product.packageQuantity) : ""
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const parsedQty = qty === "" ? null : parseFloat(qty);
    if (qty !== "" && (isNaN(parsedQty!) || parsedQty! <= 0)) {
      toast({ title: "Invalid quantity", description: "Enter a positive number.", variant: "destructive" });
      return;
    }
    updateUnit.mutate(
      {
        id: product.id,
        data: {
          productTypeId: product.productTypeId ?? null,
          packageQuantity: parsedQty,
          packageUnit: unitLabel,
          itemCount: product.itemCount ?? null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-muted/40 transition-colors">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-muted" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate leading-snug">{product.name}</p>
        {product.pricePerUnit != null && product.packageQuantity != null && (
          <p className="text-[10px] text-muted-foreground">
            HK${product.pricePerUnit.toFixed(3)}/{unitLabel} · {product.packageQuantity}{unitLabel}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min="0.001"
          step="any"
          value={qty}
          onChange={(e) => { setQty(e.target.value); setSaved(false); }}
          placeholder="qty"
          className="w-20 px-2 py-1.5 bg-background border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-all text-xs text-right"
        />
        <span className="text-xs text-muted-foreground font-mono">{unitLabel}</span>
        <button
          onClick={handleSave}
          disabled={updateUnit.isPending}
          className={cn(
            "p-1.5 rounded-lg transition-all text-sm",
            saved
              ? "bg-emerald-100 text-emerald-600"
              : "bg-primary/10 text-primary hover:bg-primary/20",
            updateUnit.isPending && "opacity-50"
          )}
          title="Save package size"
        >
          {updateUnit.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function CategoryCard({
  type,
  allProducts,
}: {
  type: ProductType;
  allProducts: Product[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [editName, setEditName] = useState(type.name);
  const [editUnit, setEditUnit] = useState(type.unitLabel);

  const updateMutation = useUpdateProductType();
  const deleteMutation = useDeleteProductType();

  const categoryProducts = allProducts.filter(
    (p) => p.productTypeId === type.id
  );

  const startEdit = () => {
    setEditName(type.name);
    setEditUnit(type.unitLabel);
    setEditing(true);
    setShowProducts(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editUnit.trim()) return;
    updateMutation.mutate(
      { id: type.id, data: { name: editName.trim(), unitLabel: editUnit.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          toast({ title: "Category updated" });
          setEditing(false);
        },
        onError: () => {
          toast({ title: "Failed to update", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = () => {
    if (!confirm(`Remove category "${type.name}"? Products using it won't be deleted.`)) return;
    deleteMutation.mutate(
      { id: type.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
          toast({ title: "Category removed" });
        },
      }
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5 text-primary" />
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="flex-1 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Category name"
              className="flex-1 px-3 py-2 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm"
              required
              autoFocus
            />
            <UnitPicker value={editUnit} onChange={setEditUnit} placeholder="unit..." />
            <div className="flex gap-1.5 shrink-0">
              <button
                type="submit"
                disabled={updateMutation.isPending || !editName.trim() || !editUnit.trim()}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-xl font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all text-sm hover:bg-primary/90"
              >
                {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-sm">{type.name}</p>
            <p className="text-xs text-muted-foreground">
              Measured per{" "}
              <span className="font-mono text-foreground bg-muted px-1 rounded">{type.unitLabel}</span>
              {categoryProducts.length > 0 && (
                <span className="ml-1.5">· {categoryProducts.length} product{categoryProducts.length !== 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {categoryProducts.length > 0 && (
              <button
                onClick={() => setShowProducts((v) => !v)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={showProducts ? "Hide products" : "Edit package sizes"}
              >
                {showProducts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={startEdit}
              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Edit category"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
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
        )}
      </div>

      {/* Product package editor panel */}
      {showProducts && (
        <div className="border-t border-border bg-muted/30 px-4 pb-3 pt-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Package sizes · {type.unitLabel}
          </p>
          {categoryProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2 italic">
              No products in this category yet.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {categoryProducts.map((p) => (
                <ProductPackageRow key={p.id} product={p} unitLabel={type.unitLabel} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductTypesPage() {
  const [name, setName] = useState("");
  const [unitLabel, setUnitLabel] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: types = [], isLoading } = useGetProductTypes();
  const { data: allProducts = [] } = useGetProducts();
  const createMutation = useCreateProductType();

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
            After adding a product, assign it a category and package size. The app calculates a unit price
            (e.g. <span className="font-mono bg-blue-100 px-1 rounded">$0.042/ml</span>) so you can compare
            value across brands and pack sizes. Use the{" "}
            <span className="font-semibold">pencil</span> icon to rename a category or change its unit, and
            the <span className="font-semibold">chevron</span> to adjust individual product package sizes.
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
          <UnitPicker value={unitLabel} onChange={setUnitLabel} />
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
            <CategoryCard key={type.id} type={type} allProducts={allProducts} />
          ))}
        </div>
      )}
    </div>
  );
}
