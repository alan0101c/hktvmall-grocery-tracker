import { useState } from "react";
import { Plus, Trash2, Loader2, Layers, Info, Pencil, X, Check, Package, PackageOpen, ChevronDown, Folder, FolderOpen, ChevronsUpDown, ChevronsDownUp, Sparkles, ArrowRight } from "lucide-react";
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
import {
  buildCategoryTree,
  branchKey,
  flattenLeaves,
  joinTypeName,
  parseTypeName,
  type TreeBranch,
  type TreeNode,
} from "@/lib/categoryTree";
import { cn } from "@/lib/utils";

const COMMON_UNITS = ["ml", "g", "kg", "L", "tablet", "capsule", "sachet", "pack", "sheet", "piece"];

const STARTER_CATEGORIES: { name: string; unitLabel: string }[] = [
  { name: "Drinks / Coke", unitLabel: "ml" },
  { name: "Drinks / Tea", unitLabel: "ml" },
  { name: "Drinks / Juice", unitLabel: "ml" },
  { name: "Drinks / Water", unitLabel: "ml" },
  { name: "Dairy / Milk", unitLabel: "ml" },
  { name: "Dairy / Cheese", unitLabel: "g" },
  { name: "Pantry / Rice", unitLabel: "kg" },
  { name: "Pantry / Cooking Oil", unitLabel: "L" },
  { name: "Pantry / Noodles", unitLabel: "g" },
  { name: "Snacks / Biscuits", unitLabel: "g" },
  { name: "Snacks / Chips", unitLabel: "g" },
  { name: "Personal Care / Shampoo", unitLabel: "ml" },
  { name: "Personal Care / Body Wash", unitLabel: "ml" },
  { name: "Personal Care / Toothpaste", unitLabel: "g" },
  { name: "Household / Laundry Detergent", unitLabel: "L" },
  { name: "Household / Dish Soap", unitLabel: "ml" },
  { name: "Household / Tissue", unitLabel: "pack" },
  { name: "Baby / Diapers", unitLabel: "piece" },
];

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

/** Shared mutation helper: move a product to another category, preserving its package data. */
function useMoveProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateUnit = useUpdateProductUnit();

  const move = (product: Product, newTypeId: number | null, allTypes: ProductType[]) => {
    if (newTypeId === (product.productTypeId ?? null)) return;
    updateUnit.mutate(
      {
        id: product.id,
        data: {
          productTypeId: newTypeId,
          packageQuantity: product.packageQuantity ?? null,
          itemCount: product.itemCount ?? null,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
          const target = allTypes.find((t) => t.id === newTypeId);
          // A move to a different-unit category quarantines the quantity — the
          // old number was expressed in the old unit and must be re-entered.
          const quarantined =
            newTypeId !== null &&
            product.packageQuantity != null &&
            updated.packageQuantity == null;
          toast({
            title: "Product moved",
            description: quarantined
              ? `Moved to "${target?.name}". Its quantity was in a different unit and has been cleared — re-enter it in ${updated.packageUnit ?? "the new unit"}.`
              : target
                ? `Moved to "${target.name}".`
                : "Removed from its category.",
          });
        },
        onError: (err) => {
          toast({
            title: "Failed to move product",
            description: (err as Error)?.message?.replace(/^HTTP \d+[^:]+:\s*/, "") || undefined,
            variant: "destructive",
          });
        },
      }
    );
  };

  return { move, isPending: updateUnit.isPending };
}

function CategorySelect({
  product,
  allTypes,
  onMove,
  disabled,
}: {
  product: Product;
  allTypes: ProductType[];
  onMove: (typeId: number | null) => void;
  disabled: boolean;
}) {
  return (
    <select
      value={product.productTypeId ?? ""}
      onChange={(e) => onMove(e.target.value === "" ? null : parseInt(e.target.value, 10))}
      disabled={disabled}
      className="max-w-32 px-1.5 py-1.5 bg-background border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-all text-xs text-muted-foreground"
      title="Move to another category"
    >
      <option value="">No category</option>
      {allTypes.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}

function ProductRow({
  product,
  type,
  allTypes,
}: {
  product: Product;
  type: ProductType;
  allTypes: ProductType[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateUnit = useUpdateProductUnit();
  const { move, isPending: isMoving } = useMoveProduct();
  const [qty, setQty] = useState<string>(
    product.packageQuantity != null ? String(product.packageQuantity) : ""
  );
  const [saved, setSaved] = useState(false);

  const handleSaveQty = () => {
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
          itemCount: product.itemCount ?? null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        },
        onError: (err) => {
          toast({
            title: "Failed to save",
            description: (err as Error)?.message?.replace(/^HTTP \d+[^:]+:\s*/, "") || undefined,
            variant: "destructive",
          });
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
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs font-medium text-foreground truncate leading-snug">{product.name}</p>
          {product.brand && (
            <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {product.brand}
            </span>
          )}
        </div>
        {product.pricePerUnit != null && product.packageQuantity != null && (
          <p className="text-[10px] text-muted-foreground">
            HK${product.pricePerUnit.toFixed(3)}/{type.unitLabel} · {product.packageQuantity}{type.unitLabel}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        <input
          type="number"
          min="0.001"
          step="any"
          value={qty}
          onChange={(e) => { setQty(e.target.value); setSaved(false); }}
          placeholder="qty"
          className="w-20 px-2 py-1.5 bg-background border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-all text-xs text-right"
        />
        <span className="text-xs text-muted-foreground font-mono">{type.unitLabel}</span>
        <button
          onClick={handleSaveQty}
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
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </button>
        <CategorySelect
          product={product}
          allTypes={allTypes}
          onMove={(id) => move(product, id, allTypes)}
          disabled={isMoving}
        />
      </div>
    </div>
  );
}

/**
 * Edit a category: name, unit, and a review table of every member listing's
 * quantity. Saved as ONE atomic request — the unit change and the reviewed
 * quantities land together, so the category never holds quantities expressed
 * in different units.
 */
function CategoryEditDialog({
  type,
  allTypes,
  products,
  onClose,
}: {
  type: ProductType;
  allTypes: ProductType[];
  products: Product[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateProductType();

  const parts = parseTypeName(type.name);
  const [editCategory, setEditCategory] = useState(parts.length >= 2 ? parts[0] : "");
  const [editType, setEditType] = useState(parts.length >= 3 ? parts[1] : "");
  const [editProduct, setEditProduct] = useState(parts.length >= 3 ? parts.slice(2).join(" / ") : parts[parts.length - 1]);
  const [editUnit, setEditUnit] = useState(type.unitLabel);
  const [quantities, setQuantities] = useState<Record<number, { qty: string; items: string }>>(() =>
    Object.fromEntries(
      products.map((p) => [
        p.id,
        {
          qty: p.packageQuantity != null ? String(p.packageQuantity) : "",
          items: p.itemCount != null ? String(p.itemCount) : "",
        },
      ])
    )
  );

  // A unit change beyond case redefines what every quantity means.
  const unitChanged =
    editUnit.trim().toLowerCase() !== type.unitLabel.trim().toLowerCase();

  // Autocomplete sources: existing level-1 segments, and level-2 segments under the chosen category.
  const categoryOptions = [...new Set(
    allTypes.map((t) => parseTypeName(t.name)).filter((p) => p.length >= 2).map((p) => p[0])
  )];
  const typeOptions = [...new Set(
    allTypes
      .map((t) => parseTypeName(t.name))
      .filter((p) => p.length >= 3 && p[0] === editCategory.trim())
      .map((p) => p[1])
  )];

  const setQty = (id: number, patch: Partial<{ qty: string; items: string }>) =>
    setQuantities((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cat = editCategory.trim();
    const typ = editType.trim();
    const prod = editProduct.trim();
    if (!prod || !editUnit.trim()) return;
    const fullName = cat
      ? typ
        ? joinTypeName([cat, typ, prod])
        : joinTypeName([cat, prod])
      : prod;

    const listings = products.map((p) => {
      const q = quantities[p.id] ?? { qty: "", items: "" };
      const qty = q.qty.trim() ? parseFloat(q.qty) : null;
      const cnt = q.items.trim() ? parseInt(q.items, 10) : null;
      return {
        productId: p.id,
        packageQuantity: qty !== null && !isNaN(qty) && qty > 0 ? qty : null,
        itemCount: cnt !== null && !isNaN(cnt) && cnt > 0 ? cnt : null,
      };
    });

    updateMutation.mutate(
      { id: type.id, data: { name: fullName, unitLabel: editUnit.trim(), listings } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          toast({
            title: "Category updated",
            description: unitChanged
              ? `Unit changed to ${editUnit.trim()} — ${products.length} listing${products.length !== 1 ? "s" : ""} updated.`
              : fullName !== type.name
                ? `Now "${fullName}".`
                : undefined,
          });
          onClose();
        },
        onError: (err) => {
          toast({
            title: "Failed to update category",
            description: (err as Error)?.message?.replace(/^HTTP \d+[^:]+:\s*/, "") || undefined,
            variant: "destructive",
          });
        },
      }
    );
  };

  const inputCls = "px-3 py-2 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h2 className="text-xl font-bold text-foreground">Edit Category</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {type.name} — unit and listing quantities save together
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Name</label>
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="Category"
                list="cat-edit-options"
                className={cn(inputCls, "w-28")}
                title="Level 1 — category (optional)"
              />
              <datalist id="cat-edit-options">
                {categoryOptions.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <span className="text-muted-foreground text-sm shrink-0">/</span>
              <input
                type="text"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                placeholder="Type"
                list="type-edit-options"
                className={cn(inputCls, "w-28")}
                title="Level 2 — product type (optional)"
              />
              <datalist id="type-edit-options">
                {typeOptions.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <span className="text-muted-foreground text-sm shrink-0">/</span>
              <input
                type="text"
                value={editProduct}
                onChange={(e) => setEditProduct(e.target.value)}
                placeholder="Product name"
                className={cn(inputCls, "flex-1 min-w-32")}
                required
                autoFocus
                title="Level 3 — the product you are sourcing (required)"
              />
            </div>
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Unit</label>
            <p className="text-xs text-muted-foreground">
              Every listing below is compared per this unit. Changing it redefines what the quantities mean.
            </p>
            <UnitPicker value={editUnit} onChange={setEditUnit} placeholder="unit..." />
            {unitChanged && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Unit changed from <b>{type.unitLabel}</b> to <b>{editUnit.trim()}</b> — the quantities
                  below are still in <b>{type.unitLabel}</b>. Review every listing before saving
                  (e.g. 1.5 {type.unitLabel} → 1500 {editUnit.trim()}). The unit and all quantities
                  update together on Save.
                </span>
              </div>
            )}
          </div>

          {/* Listings review table */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">
              Listings <span className="text-muted-foreground font-normal">({products.length})</span>
            </label>
            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No listings in this category yet.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border/50 border border-border rounded-xl overflow-hidden">
                {products.map((p) => {
                  const q = quantities[p.id] ?? { qty: "", items: "" };
                  const qtyNum = q.qty.trim() ? parseFloat(q.qty) : null;
                  const cntNum = q.items.trim() ? parseInt(q.items, 10) : null;
                  const price = p.adjustedPrice ?? p.currentPrice;
                  let preview: string | null = null;
                  if (cntNum !== null && !isNaN(cntNum) && cntNum > 0) {
                    preview = `= HK$${(price / cntNum).toFixed(2)} per ${qtyNum !== null && !isNaN(qtyNum) && qtyNum > 0 ? `${qtyNum}${editUnit.trim()}` : "item"}`;
                  } else if (qtyNum !== null && !isNaN(qtyNum) && qtyNum > 0) {
                    preview = `= HK$${(price / qtyNum).toFixed(3)}/${editUnit.trim()}`;
                  }
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-background">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-muted" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate leading-snug">{p.name}</p>
                        {preview && (
                          <p className="text-[10px] text-emerald-600 font-semibold">{preview}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="qty"
                          value={q.qty}
                          onChange={(e) => setQty(p.id, { qty: e.target.value })}
                          className="w-20 px-2 py-1.5 bg-muted/40 border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-all text-xs text-right"
                          title={`Package size per item, in ${editUnit.trim() || type.unitLabel}`}
                        />
                        <span className="text-[10px] text-muted-foreground font-mono w-8">
                          {editUnit.trim() || type.unitLabel}
                        </span>
                        <span className="text-[10px] text-muted-foreground">×</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="items"
                          value={q.items}
                          onChange={(e) => setQty(p.id, { items: e.target.value })}
                          className="w-16 px-2 py-1.5 bg-muted/40 border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-all text-xs text-right"
                          title="Items in the package (optional)"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSave}
            disabled={updateMutation.isPending || !editProduct.trim() || !editUnit.trim()}
            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 transition-all text-sm hover:bg-primary/90"
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({
  type,
  allTypes,
  allProducts,
  expanded,
  onToggle,
}: {
  type: ProductType;
  allTypes: ProductType[];
  allProducts: Product[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);

  const deleteMutation = useDeleteProductType();

  const categoryProducts = allProducts.filter(
    (p) => p.productTypeId === type.id
  );

  const parts = parseTypeName(type.name);
  const displayName = parts[parts.length - 1] ?? type.name;

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
    <div
      className={cn(
        "bg-card border rounded-2xl shadow-sm overflow-hidden transition-colors",
        expanded ? "border-primary/30" : "border-border"
      )}
    >
      {/* Header row — click anywhere to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180 text-primary"
          )}
        />
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="w-4.5 h-4.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-sm truncate" title={type.name}>{displayName}</p>
          <p className="text-xs text-muted-foreground">
            per{" "}
            <span className="font-mono text-foreground bg-muted px-1 rounded">{type.unitLabel}</span>
            <span className="ml-1.5">
              · {categoryProducts.length} listing{categoryProducts.length !== 1 ? "s" : ""}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Edit — name, unit and listing quantities (saved together)"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
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
      </div>

      {/* Expanded product list */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-4 pb-3 pt-3">
          {categoryProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2 italic">
              No listings here yet. Move them from another category or from the uncategorised inbox below.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {categoryProducts.map((p) => (
                <ProductRow key={p.id} product={p} type={type} allTypes={allTypes} />
              ))}
            </div>
          )}
        </div>
      )}

      {dialogOpen && (
        <CategoryEditDialog
          type={type}
          allTypes={allTypes}
          products={categoryProducts}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function BranchSection({
  branch,
  allTypes,
  allProducts,
  collapsedBranches,
  onToggleBranch,
  expandedIds,
  onToggleCard,
}: {
  branch: TreeBranch<ProductType>;
  allTypes: ProductType[];
  allProducts: Product[];
  collapsedBranches: Set<string>;
  onToggleBranch: (key: string) => void;
  expandedIds: Set<number>;
  onToggleCard: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateProductType();

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(branch.segment);

  const key = branchKey(branch.prefix);
  const collapsed = collapsedBranches.has(key);

  const descendantTypes = flattenLeaves(branch);
  const totalProducts = allProducts.filter((p) =>
    descendantTypes.some((t) => t.id === p.productTypeId)
  ).length;

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || trimmed === branch.segment) {
      setRenaming(false);
      setNewName(branch.segment);
      return;
    }
    try {
      await Promise.all(
        descendantTypes.map((t) => {
          const parts = parseTypeName(t.name);
          const newParts = [
            ...branch.prefix.slice(0, -1),
            trimmed,
            ...parts.slice(branch.prefix.length),
          ];
          return updateMutation.mutateAsync({
            id: t.id,
            data: { name: joinTypeName(newParts), unitLabel: t.unitLabel },
          });
        })
      );
      queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      toast({
        title: "Renamed",
        description: `"${branchKey(branch.prefix)}" is now "${joinTypeName([...branch.prefix.slice(0, -1), trimmed])}".`,
      });
      setRenaming(false);
    } catch {
      toast({ title: "Failed to rename", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Branch header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !renaming && onToggleBranch(key)}
        onKeyDown={(e) => {
          if (!renaming && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggleBranch(key);
          }
        }}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors",
          !renaming && "cursor-pointer select-none hover:bg-muted/60"
        )}
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200",
            collapsed && "-rotate-90"
          )}
        />
        {collapsed ? (
          <Folder className="w-4 h-4 shrink-0 text-primary" />
        ) : (
          <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
        )}

        {renaming ? (
          <form onSubmit={handleRename} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 max-w-64 px-3 py-1.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-semibold"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={updateMutation.isPending || !newName.trim()}
              className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
              title="Rename (updates everything inside)"
            >
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => { setRenaming(false); setNewName(branch.segment); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <>
            <span className="flex-1 min-w-0 text-xs font-bold uppercase tracking-wider text-muted-foreground truncate" title={key}>
              {branch.segment}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
              {descendantTypes.length} {descendantTypes.length === 1 ? "item" : "items"} · {totalProducts} listing{totalProducts !== 1 ? "s" : ""}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setNewName(branch.segment); setRenaming(true); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
              title="Rename this level (updates everything inside)"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Branch children */}
      {!collapsed && (
        <div className="ml-5 pl-4 border-l-2 border-border/60 flex flex-col gap-2.5">
          {branch.children.map((child) =>
            child.kind === "leaf" ? (
              <CategoryCard
                key={child.item.id}
                type={child.item}
                allTypes={allTypes}
                allProducts={allProducts}
                expanded={expandedIds.has(child.item.id)}
                onToggle={() => onToggleCard(child.item.id)}
              />
            ) : (
              <BranchSection
                key={branchKey(child.prefix)}
                branch={child}
                allTypes={allTypes}
                allProducts={allProducts}
                collapsedBranches={collapsedBranches}
                onToggleBranch={onToggleBranch}
                expandedIds={expandedIds}
                onToggleCard={onToggleCard}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function UncategorisedInbox({
  products,
  allTypes,
}: {
  products: Product[];
  allTypes: ProductType[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateUnit = useUpdateProductUnit();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [targetType, setTargetType] = useState("");
  const [bulkMoving, setBulkMoving] = useState(false);

  const productIds = new Set(products.map((p) => p.id));
  const selectedInView = new Set([...selected].filter((id) => productIds.has(id)));
  const allSelected = products.length > 0 && selectedInView.size === products.length;

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllInbox = () => {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  };

  const handleBulkAssign = async () => {
    const typeId = parseInt(targetType, 10);
    if (isNaN(typeId) || selectedInView.size === 0) return;
    const byId = new Map(products.map((p) => [p.id, p]));
    setBulkMoving(true);
    try {
      await Promise.all(
        [...selectedInView].map((id) => {
          const p = byId.get(id)!;
          return updateUnit.mutateAsync({
            id: p.id,
            data: {
              productTypeId: typeId,
              packageQuantity: p.packageQuantity ?? null,
              itemCount: p.itemCount ?? null,
            },
          });
        })
      );
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
      const target = allTypes.find((t) => t.id === typeId);
      toast({
        title: `${selectedInView.size} product${selectedInView.size !== 1 ? "s" : ""} moved`,
        description: target ? `Assigned to "${target.name}".` : undefined,
      });
      setSelected(new Set());
      setTargetType("");
    } catch {
      toast({ title: "Bulk assign failed", description: "Some products could not be moved.", variant: "destructive" });
    } finally {
      setBulkMoving(false);
    }
  };

  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-2xl shadow-sm overflow-hidden mt-8">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <PackageOpen className="w-4.5 h-4.5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-sm">Uncategorised inbox</p>
          <p className="text-xs text-muted-foreground">
            {products.length} product{products.length !== 1 ? "s" : ""} without a category — tick several and assign them in one go.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer shrink-0 select-none">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAllInbox}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          All
        </label>
      </div>

      <div className="border-t border-amber-200/70 px-4 pb-3 pt-3">
        <div className="flex flex-col divide-y divide-amber-200/50">
          {products.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors",
                selectedInView.has(p.id) ? "bg-amber-100/60" : "hover:bg-amber-100/40"
              )}
            >
              <input
                type="checkbox"
                checked={selectedInView.has(p.id)}
                onChange={() => toggleOne(p.id)}
                className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
              />
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-muted" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-amber-600" />
                </div>
              )}
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <p className="min-w-0 text-xs font-medium text-foreground truncate leading-snug">{p.name}</p>
                {p.brand && (
                  <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {p.brand}
                  </span>
                )}
              </div>
              <SingleMove product={p} allTypes={allTypes} />
            </div>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedInView.size > 0 && (
        <div className="border-t border-amber-200/70 bg-card px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            {selectedInView.size} selected
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="flex-1 min-w-40 max-w-64 px-2 py-1.5 bg-background border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-all text-xs"
          >
            <option value="">Choose a category…</option>
            {allTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={bulkMoving || !targetType}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {bulkMoving && <Loader2 className="w-3 h-3 animate-spin" />}
            Move {selectedInView.size > 1 ? `all ${selectedInView.size}` : "it"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-2 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function SingleMove({ product, allTypes }: { product: Product; allTypes: ProductType[] }) {
  const { move, isPending } = useMoveProduct();
  return (
    <CategorySelect
      product={product}
      allTypes={allTypes}
      onMove={(id) => move(product, id, allTypes)}
      disabled={isPending}
    />
  );
}

function StarterSetButton({
  existingTypes,
  className,
}: {
  existingTypes: ProductType[];
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateProductType();
  const [loading, setLoading] = useState(false);

  const missing = STARTER_CATEGORIES.filter(
    (s) => !existingTypes.some((t) => t.name.toLowerCase() === s.name.toLowerCase())
  );

  const handleLoad = async () => {
    if (missing.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(
        missing.map((s) => createMutation.mutateAsync({ data: { name: s.name, unitLabel: s.unitLabel } }))
      );
      queryClient.invalidateQueries({ queryKey: getGetProductTypesQueryKey() });
      toast({
        title: "Starter set added",
        description: `${missing.length} categor${missing.length === 1 ? "y" : "ies"} created — rename or delete any you don't need.`,
      });
    } catch {
      toast({ title: "Failed to add starter set", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (missing.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleLoad}
      disabled={loading || createMutation.isPending}
      className={cn(
        "px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-secondary/80 transition-all text-sm disabled:opacity-50",
        className
      )}
      title={missing.map((s) => s.name).join(", ")}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
      Load starter set ({missing.length})
    </button>
  );
}

export default function ProductTypesPage() {
  const [name, setName] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: types = [], isLoading } = useGetProductTypes();
  const { data: allProducts = [] } = useGetProducts();
  const createMutation = useCreateProductType();

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBranch = (key: string) => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const nodes = buildCategoryTree(types, (t) => t.name);
  const topLevelBranchKeys = nodes
    .filter((n): n is TreeBranch<ProductType> => n.kind === "branch")
    .map((n) => branchKey(n.prefix));

  const allExpanded =
    types.length > 0 &&
    types.every((t) => expandedIds.has(t.id)) &&
    collapsedBranches.size === 0;

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
      setCollapsedBranches(new Set(topLevelBranchKeys));
    } else {
      setExpandedIds(new Set(types.map((t) => t.id)));
      setCollapsedBranches(new Set());
    }
  };

  const uncategorised = allProducts.filter((p) => p.productTypeId == null);

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
          A three-level tree — category, product type, product — with unit pricing at every leaf.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-8 text-sm text-blue-800">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-semibold">How it works</p>
          <p className="text-blue-700 mt-0.5">
            Name each leaf{" "}
            <span className="font-mono bg-blue-100 px-1 rounded">Category / Type / Product</span> (e.g.{" "}
            <span className="font-mono bg-blue-100 px-1 rounded">Baby / Shampoo / Mustela</span>). Every "/"
            adds a collapsible level here and in the Watchlist sidebar; listings assigned to a leaf are the
            different HKTVmall listings of that product. Edit a leaf to move it between levels — the level
            fields autocomplete from what you already have. The pencil on a folder renames that whole branch.
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
            placeholder="e.g. Baby / Shampoo / Mustela, or just Rice"
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
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">or</span>
          <StarterSetButton existingTypes={types} />
        </div>
      </div>

      {/* Categories tree */}
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
          <p className="text-muted-foreground text-sm max-w-xs mb-5">
            Create a category above, or start from a ready-made tree you can trim down.
          </p>
          <StarterSetButton existingTypes={types} />
        </div>
      ) : (
        <>
          {types.length > 1 && (
            <div className="flex justify-end mb-2">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {allExpanded ? (
                  <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse all</>
                ) : (
                  <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand all</>
                )}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {nodes.map((node) =>
              node.kind === "leaf" ? (
                <CategoryCard
                  key={node.item.id}
                  type={node.item}
                  allTypes={types}
                  allProducts={allProducts}
                  expanded={expandedIds.has(node.item.id)}
                  onToggle={() => toggleExpanded(node.item.id)}
                />
              ) : (
                <BranchSection
                  key={branchKey(node.prefix)}
                  branch={node}
                  allTypes={types}
                  allProducts={allProducts}
                  collapsedBranches={collapsedBranches}
                  onToggleBranch={toggleBranch}
                  expandedIds={expandedIds}
                  onToggleCard={toggleExpanded}
                />
              )
            )}
          </div>
        </>
      )}

      {/* Uncategorised inbox */}
      {!isLoading && uncategorised.length > 0 && (
        <UncategorisedInbox products={uncategorised} allTypes={types} />
      )}
    </div>
  );
}
