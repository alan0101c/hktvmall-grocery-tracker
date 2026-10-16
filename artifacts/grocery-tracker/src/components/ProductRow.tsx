import { Trash2, Bell, RefreshCw, TrendingDown, TrendingUp, ExternalLink, Tag, Loader2, Crown, Layers, BadgePercent, CircleOff, TriangleAlert } from "lucide-react";
import {
  type Product,
  useDeleteProduct,
  useRefreshProduct,
  getGetProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn, formatHKD } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface ProductRowProps {
  product: Product;
  onClick: () => void;
  onSetAlert: (e: React.MouseEvent) => void;
}

export function ProductRow({ product, onClick, onSetAlert }: ProductRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteMutation = useDeleteProduct();
  const refreshMutation = useRefreshProduct();

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
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() }),
      onError: (err) => {
        toast({
          title: product.status === "unavailable" ? "Product no longer available" : "Refresh failed",
          description: err.message,
          variant: "destructive",
        });
        // Even on failure the backend records the outcome — re-fetch so the
        // failure status / unavailable flag shows up on the row.
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      },
    });
  };

  const displayPrice = product.adjustedPrice ?? product.currentPrice;
  const globalDiscountPercent = product.globalDiscountPercent ?? 0;
  const hasGlobalDiscount = globalDiscountPercent > 0 && displayPrice < product.currentPrice;

  const hasDiscount = product.originalPrice && displayPrice < product.originalPrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - displayPrice) / product.originalPrice!) * 100)
    : 0;

  const promoList: string[] = product.promotionTexts ?? [];

  const hasUnitPrice = product.pricePerUnit != null && product.pricePerUnit > 0 && product.packageUnit;

  // Badge label differs by mode: per-item → "HK$X/950ml"; total → "HK$X/ml"
  const unitPriceBadge = hasUnitPrice
    ? product.itemCount != null && product.itemCount > 0
      ? `${formatHKD(product.pricePerUnit!)}/${product.packageQuantity}${product.packageUnit}`
      : `${formatHKD(product.pricePerUnit!)}/${product.packageUnit}`
    : null;

  const isOutOfStock = product.inStock === false;
  const isUnavailable = product.status === "unavailable";
  const lastRefreshFailed = !isUnavailable && !!product.lastRefreshError;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-0 bg-card border rounded-2xl transition-all cursor-pointer hover:shadow-lg hover:border-primary/30",
        product.isBelowAlert ? "border-primary/50 bg-primary/5" : "border-border shadow-sm shadow-black/5",
        (isOutOfStock || isUnavailable) && "opacity-60 border-border/50",
        isUnavailable && "bg-muted/30"
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
              {isUnavailable && (
                <span
                  className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-destructive/10 text-destructive text-[10px] font-semibold rounded-md border border-destructive/30"
                  title="This product could not be found on HKTVmall during the last refresh. The record and price history are kept."
                >
                  <CircleOff className="w-3 h-3" />
                  No longer available
                </span>
              )}
              {isOutOfStock && (
                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] font-semibold rounded-md border border-border/60">
                  Out of Stock
                </span>
              )}
            </div>
            {product.nameZh && <p className="text-xs text-muted-foreground truncate mt-0.5">{product.nameZh}</p>}
            {(isUnavailable || lastRefreshFailed) && (
              <p className="text-[11px] text-destructive/80 flex items-center gap-1 mt-1">
                <TriangleAlert className="w-3 h-3 shrink-0" />
                {isUnavailable
                  ? "Removed from HKTVmall — last known price kept below."
                  : `Last refresh failed: ${product.lastRefreshError}`}
              </p>
            )}
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
                  <span className="text-xl font-bold text-foreground">{formatHKD(displayPrice)}</span>
                  {hasGlobalDiscount && (
                    <span className="text-xs text-muted-foreground line-through">{formatHKD(product.currentPrice)}</span>
                  )}
                  {hasDiscount && (
                    <span className="text-[10px] text-muted-foreground/60 line-through">{formatHKD(product.originalPrice)}</span>
                  )}
                  {hasGlobalDiscount && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md">
                      <BadgePercent className="w-3 h-3" />
                      -{globalDiscountPercent}%
                    </span>
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
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold rounded-lg leading-tight"
                  title="Price per unit — units and package sizes are managed on the Categories page"
                >
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
    </div>
  );
}
