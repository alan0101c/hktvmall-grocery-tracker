import { Trash2, Bell, RefreshCw, TrendingDown, TrendingUp, ExternalLink, Tag, Scale } from "lucide-react";
import { type Product, useDeleteProduct, useRefreshProduct, getGetProductsQueryKey } from "@workspace/api-client-react";
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

  const hasDiscount = product.originalPrice && product.currentPrice < product.originalPrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - product.currentPrice) / product.originalPrice!) * 100)
    : 0;

  const hasUnitPrice = product.pricePerUnit != null && product.pricePerUnit > 0 && product.packageUnit;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-5 bg-card border rounded-2xl transition-all cursor-pointer hover:shadow-lg hover:border-primary/30",
        product.isBelowAlert ? "border-primary/50 bg-primary/5" : "border-border shadow-sm shadow-black/5"
      )}
    >
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
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground truncate text-sm sm:text-base leading-tight group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            {product.nameZh && <p className="text-xs text-muted-foreground truncate mt-0.5">{product.nameZh}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-foreground">{formatHKD(product.currentPrice)}</span>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">{formatHKD(product.originalPrice)}</span>
            )}
          </div>

          {/* Price change indicator */}
          {product.priceChange !== null && product.priceChange !== undefined && product.priceChange !== 0 && (
            <div className={cn("flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md", product.priceChange < 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
              {product.priceChange < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {formatHKD(Math.abs(product.priceChange))}
            </div>
          )}

          {/* Alert status */}
          {product.alertPrice && (
            <div className={cn("text-xs font-medium flex items-center gap-1", product.isBelowAlert ? "text-primary" : "text-muted-foreground")}>
              <Bell className="w-3 h-3" /> Target: {formatHKD(product.alertPrice)}
            </div>
          )}
        </div>

        {/* Badges row: promotion + unit price */}
        {(product.promotionText || hasUnitPrice) && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {product.promotionText && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold rounded-lg leading-tight max-w-[240px] truncate">
                <Tag className="w-3 h-3 shrink-0" />
                <span className="truncate">{product.promotionText}</span>
              </span>
            )}
            {hasUnitPrice && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold rounded-lg leading-tight">
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
  );
}
