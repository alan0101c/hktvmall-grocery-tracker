import { useState } from "react";
import { Trash2, Bell, RefreshCw, TrendingDown, TrendingUp, ExternalLink, Tag, Scale, X, Check, Loader2, Hash, Beaker, Crown, Layers } from "lucide-react";
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

type InputMode = "total" | "perItem";

export function ProductRow({ product, onClick, onSetAlert }: ProductRowProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteProduct();
  const refreshMutation = useRefreshProduct();
  const updateUnitMutation = useUpdateProductUnit();
  const { data: productTypes = [] } = useGetProductTypes();

  const [editingUnit, setEditingUnit] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(product.productTypeId ?? null);
  const [packageUnit, setPackageUnit] = useState(product.packageUnit ?? "");

  // Two modes: "total" = user enters total volume (e.g. 2850ml); "perItem" = user enters unit size × item count (950ml × 3)
  const [inputMode, setInputMode] = useState<InputMode>(
    product.itemCount != null ? "perItem" : "total"
  );
  const [unitSize, setUnitSize] = useState(product.packageQuantity ? String(product.packageQuantity) : "");
  const [itemCount, setItemCount] = useState(product.itemCount ? String(product.itemCount) : "");
  const [totalQty, setTotalQty] = useState(
    product.itemCount == null && product.packageQuantity ? String(product.packageQuantity) : ""
  );

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
    setSelectedTypeId(product.productTypeId ?? null);
    setPackageUnit(product.packageUnit ?? "");
    const isPerItem = product.itemCount != null;
    setInputMode(isPerItem ? "perItem" : "total");
    setUnitSize(product.packageQuantity ? String(product.packageQuantity) : "");
    setItemCount(product.itemCount ? String(product.itemCount) : "");
    setTotalQty(product.itemCount == null && product.packageQuantity ? String(product.packageQuantity) : "");
    setEditingUnit(true);
  };

  const handleCancelUnit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingUnit(false);
  };

  const handleSaveUnit = (e: React.MouseEvent) => {
    e.stopPropagation();

    let packageQuantity: number | null = null;
    let finalItemCount: number | null = null;

    if (inputMode === "perItem") {
      const sz = parseFloat(unitSize);
      const cnt = parseInt(itemCount);
      packageQuantity = !isNaN(sz) && sz > 0 ? sz : null;
      finalItemCount = !isNaN(cnt) && cnt > 0 ? cnt : null;
    } else {
      const tot = parseFloat(totalQty);
      packageQuantity = !isNaN(tot) && tot > 0 ? tot : null;
      finalItemCount = null;
    }

    updateUnitMutation.mutate(
      {
        id: product.id,
        data: {
          productTypeId: selectedTypeId,
          packageQuantity,
          packageUnit: packageUnit.trim() || null,
          itemCount: finalItemCount,
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

  const promoList: string[] = product.promotionTexts ?? [];

  const hasUnitPrice = product.pricePerUnit != null && product.pricePerUnit > 0 && product.packageUnit;

  // Badge label differs by mode: per-item → "HK$X/950ml"; total → "HK$X/ml"
  const unitPriceBadge = hasUnitPrice
    ? product.itemCount != null && product.itemCount > 0
      ? `${formatHKD(product.pricePerUnit!)}/${product.packageQuantity}${product.packageUnit}`
      : `${formatHKD(product.pricePerUnit!)}/${product.packageUnit}`
    : null;

  // Live preview in the editor
  const previewPricePerUnit = (() => {
    if (inputMode === "perItem") {
      const cnt = parseInt(itemCount);
      if (!isNaN(cnt) && cnt > 0) return product.currentPrice / cnt;
    } else {
      const tot = parseFloat(totalQty);
      if (!isNaN(tot) && tot > 0) return product.currentPrice / tot;
    }
    return null;
  })();

  const previewLabel = (() => {
    if (previewPricePerUnit === null) return null;
    if (inputMode === "perItem") {
      const sz = parseFloat(unitSize);
      if (!isNaN(sz) && sz > 0 && packageUnit) return `${formatHKD(previewPricePerUnit)} per ${sz}${packageUnit}`;
      return `${formatHKD(previewPricePerUnit)} per item`;
    }
    return `${formatHKD(previewPricePerUnit)}/${packageUnit || "unit"}`;
  })();

  const isOutOfStock = product.inStock === false;

  return (
    <div
      onClick={editingUnit ? undefined : onClick}
      className={cn(
        "group relative flex flex-col gap-0 bg-card border rounded-2xl transition-all",
        !editingUnit && "cursor-pointer hover:shadow-lg hover:border-primary/30",
        product.isBelowAlert ? "border-primary/50 bg-primary/5" : "border-border shadow-sm shadow-black/5",
        isOutOfStock && "opacity-60 border-border/50"
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
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-bold text-foreground truncate text-sm sm:text-base leading-tight group-hover:text-primary transition-colors">
                {product.name}
              </h3>
              {isOutOfStock && (
                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] font-semibold rounded-md border border-border/60">
                  Out of Stock
                </span>
              )}
            </div>
            {product.nameZh && <p className="text-xs text-muted-foreground truncate mt-0.5">{product.nameZh}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
            <div className="flex items-baseline gap-2">
              {product.plusPrice != null ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xl font-bold text-emerald-700">
                    <Crown className="w-4 h-4 shrink-0" />
                    {formatHKD(product.plusPrice)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md">Plus</span>
                  <span className="text-xs text-muted-foreground line-through">{formatHKD(product.currentPrice)}</span>
                  {hasDiscount && (
                    <span className="text-[10px] text-muted-foreground/60 line-through">{formatHKD(product.originalPrice)}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xl font-bold text-foreground">{formatHKD(product.currentPrice)}</span>
                  {hasDiscount && (
                    <span className="text-xs text-muted-foreground line-through">{formatHKD(product.originalPrice)}</span>
                  )}
                </>
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
          {(promoList.length > 0 || unitPriceBadge || product.productTypeName) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {promoList.map((txt, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold rounded-lg leading-tight max-w-[240px] truncate">
                  <Tag className="w-3 h-3 shrink-0" />
                  <span className="truncate">{txt}</span>
                </span>
              ))}
              {product.productTypeName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-semibold rounded-lg leading-tight">
                  <Layers className="w-3 h-3 shrink-0" />
                  {product.productTypeName}
                </span>
              )}
              {unitPriceBadge && (
                <span
                  onClick={e => { e.stopPropagation(); handleEditUnit(e); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold rounded-lg leading-tight cursor-pointer hover:bg-emerald-100 transition-colors"
                  title="Edit unit pricing"
                >
                  <Scale className="w-3 h-3 shrink-0" />
                  {unitPriceBadge}
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
          className="border-t border-border/60 px-4 sm:px-5 py-4 bg-muted/30 rounded-b-2xl space-y-4"
        >
          <div className="flex items-center justify-between">
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
                onClick={() => setSelectedTypeId(null)}
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

          {/* Mode toggle */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Package size</p>
            <div className="flex gap-1 p-0.5 bg-muted rounded-lg w-fit mb-3">
              <button
                onClick={() => setInputMode("total")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  inputMode === "total"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Beaker className="w-3 h-3" />
                Total volume
              </button>
              <button
                onClick={() => setInputMode("perItem")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  inputMode === "perItem"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Hash className="w-3 h-3" />
                Per item
              </button>
            </div>

            {inputMode === "total" ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Enter the total amount in the package (e.g. 2850ml for a 3-pack of 950ml bottles).</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 2850"
                    value={totalQty}
                    onChange={e => setTotalQty(e.target.value)}
                    className="w-28 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
                  />
                  <input
                    type="text"
                    placeholder="ml / g / tablet"
                    value={packageUnit}
                    onChange={e => setPackageUnit(e.target.value)}
                    className="w-28 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
                  />
                  {previewLabel && (
                    <span className="text-xs text-emerald-600 font-semibold">= {previewLabel}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Enter the size of each individual item and how many you're getting (e.g. 950ml × 3 bottles).</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="950"
                      value={unitSize}
                      onChange={e => setUnitSize(e.target.value)}
                      className="w-24 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="ml / g"
                      value={packageUnit}
                      onChange={e => setPackageUnit(e.target.value)}
                      className="w-20 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">×</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="3"
                      value={itemCount}
                      onChange={e => setItemCount(e.target.value)}
                      className="w-20 px-3 py-1.5 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
                    />
                    <span className="text-xs text-muted-foreground">items</span>
                  </div>
                  {previewLabel && (
                    <span className="text-xs text-emerald-600 font-semibold">= {previewLabel}</span>
                  )}
                </div>
              </div>
            )}
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
