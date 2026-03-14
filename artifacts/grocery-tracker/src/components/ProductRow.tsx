import { useState } from "react";
import { Trash2, Bell, RefreshCw, TrendingDown, TrendingUp, ExternalLink, Tag, Scale, X, Check, Loader2 } from "lucide-react";
import {
  type Product,
  useDeleteProduct,
  useRefreshProduct,
  useUpdateProductUnit,
  useGetProductTypes,
  getGetProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn, formatHKD } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ProductRowProps {
  product: Product;
  onClick: () => void;
  onSetAlert: (e: React.MouseEvent) => void;
}

export function ProductRow({ product, onClick, onSetAlert }: ProductRowProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteProduct();
  const refreshMutation = useRefreshProduct();
  const updateUnitMutation = useUpdateProductUnit();
  const { data: productTypes = [] } = useGetProductTypes();

  const [editingUnit, setEditingUnit] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(product.productTypeId ?? null);
  const [packageQuantity, setPackageQuantity] = useState(product.packageQuantity ? String(product.packageQuantity) : "");
  const [packageUnit, setPackageUnit] = useState(product.packageUnit ?? "");

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Remove this product from watchlist?")) {
      deleteMutation.mutate({ id: product.id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() })
      });
    }
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshMutation.mutate({ id: product.id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() })
    });
  };

  const handleEditUnit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Reset to current product values each time panel opens
    setSelectedTypeId(product.productTypeId ?? null);
    setPackageQuantity(product.packageQuantity ? String(product.packageQuantity) : "");
    setPackageUnit(product.packageUnit ?? "");
    setEditingUnit(true);
  };

  const handleCancelUnit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingUnit(false);
  };

  const handleSaveUnit = (e: React.MouseEvent) => {
    e.stopPropagation();
    const qty = parseFloat(packageQuantity);
    updateUnitMutation.mutate(
      {
        id: product.id,
        data: {
          productTypeId: selectedTypeId,
          packageQuantity: !isNaN(qty) && qty > 0 ? qty : null,
          packageUnit: packageUnit.trim() || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          setEditingUnit(false);
        },
      }
    );
  };

  const hasDiscount = product.originalPrice && product.currentPrice < product.originalPrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - product.currentPrice) / product.originalPrice!) * 100)
    : 0;

  const hasUnitPrice = product.pricePerUnit != null && product.pricePerUnit > 0 && product.packageUnit;

  const previewQty = parseFloat(packageQuantity);
  const previewUnitPrice = !isNaN(previewQty) && previewQty > 0
    ? product.currentPrice / previewQty
    : null;

  return (
    <div
      onClick={editingUnit ? undefined : onClick}
      className={cn(
        "group relative flex flex-col gap-0 bg-card border rounded-2xl transition-all",
        !editingUnit && "cursor-pointer hover:shadow-lg hover:border-primary/30",
        product.isBelowAlert ? "border-primary/50 bg-primary/5" : "border-border shadow-sm shadow-black/5"
      )}
    >
      {/* Main row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-5">
        {/* Product Image */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-white rounded-xl border border-border p-1.5 flex items-center justify-center relative">
          {hasDiscount && (
            <span className="absolute -top-2 -left-2 bg-destructive text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
              -{discountPercent}%
            </span>
          )}
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-8 h-8 bg-muted rounded-full" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground truncate text-sm sm:text-base leading-tight group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            {product.nameZh && <p className="text-xs text-muted-foreground truncate mt-0.5">{product.nameZh}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-foreground">{formatHKD(product.currentPrice)}</span>
              {hasDiscount && (
                <span className="text-xs text-muted-foreground line-through">{formatHKD(product.originalPrice)}</span>
              )}
            </div>

            {product.priceChange !== null && product.priceChange !== undefined && product.priceChange !== 0 && (
              <div className={cn("flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md", product.priceChange < 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                {product.priceChange < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {formatHKD(Math.abs(product.priceChange))}
              </div>
            )}

            {product.alertPrice && (
              <div className={cn("text-xs font-medium flex items-center gap-1", product.isBelowAlert ? "text-primary" : "text-muted-foreground")}>
                <Bell className="w-3 h-3" /> Target: {formatHKD(product.alertPrice)}
              </div>
            )}
          </div>

          {/* Badges */}
          {(product.promotionText || hasUnitPrice) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {product.promotionText && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold rounded-lg leading-tight max-w-[240px] truncate">
                  <Tag className="w-3 h-3 shrink-0" />
                  <span className="truncate">{product.promotionText}</span>
                </span>
              )}
              {hasUnitPrice && (
                <span
                  onClick={e => { e.stopPropagation(); handleEditUnit(e); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold rounded-lg leading-tight cursor-pointer hover:bg-emerald-100 transition-colors"
                  title="Edit unit pricing"
                >
                  <Scale className="w-3 h-3 shrink-0" />
                  {formatHKD(product.pricePerUnit!!)}/{product.packageUnit}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0 border-t sm:border-0 border-border/50">
          <span className="text-[10px] text-muted-foreground sm:hidden">
            Updated {formatDistanceToNow(new Date(product.lastUpdated))} ago
          </span>

          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            {product.productUrl && (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Open in HKTVMall"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onSetAlert}
              className={cn("p-2 rounded-lg transition-colors", product.alertPrice ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
              title="Set Price Alert"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={handleEditUnit}
              className={cn(
                "p-2 rounded-lg transition-colors",
                (hasUnitPrice || product.productTypeId)
                  ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                  : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
              )}
              title="Set unit pricing / category"
            >
              <Scale className="w-4 h-4" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Price"
            >
              <RefreshCw className={cn("w-4 h-4", refreshMutation.isPending && "animate-spin text-primary")} />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              title="Remove Product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inline unit edit panel */}
      {editingUnit && (
        <div
          onClick={e => e.stopPropagation()}
          className="border-t border-border/60 px-4 sm:px-5 py-4 bg-muted/30 rounded-b-2xl space-y-3"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-emerald-600" />
              Unit Pricing &amp; Category
            </p>
            <button onClick={handleCancelUnit} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Category chips */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Category</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setSelectedTypeId(null); }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                  selectedTypeId === null
                    ? "bg-muted border-border text-foreground"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                )}
              >
                None
              </button>
              {productTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setSelectedTypeId(type.id);
                    if (!packageUnit) setPackageUnit(type.unitLabel);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                    selectedTypeId === type.id
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-background border-border text-foreground hover:border-primary/30"
                  )}
                >
                  {type.name}
                </button>
              ))}
              {productTypes.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No categories — create some in the Categories page.</span>
              )}
            </div>
          </div>

          {/* Quantity + unit */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Package size</p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 500"
                value={packageQuantity}
                onChange={e => setPackageQuantity(e.target.value)}
                className="w-28 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
              />
              <input
                type="text"
                placeholder="ml / g / tablet"
                value={packageUnit}
                onChange={e => setPackageUnit(e.target.value)}
                className="w-28 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
              />
              {previewUnitPrice !== null && (
                <span className="text-xs text-emerald-600 font-semibold">
                  = {formatHKD(previewUnitPrice)}/{packageUnit || "unit"}
                </span>
              )}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveUnit}
              disabled={updateUnitMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold shadow-sm hover:-translate-y-0.5 hover:shadow disabled:opacity-50 disabled:transform-none transition-all"
            >
              {updateUnitMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {updateUnitMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleCancelUnit}
              className="px-4 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-semibold hover:bg-muted/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
