import { useState, useMemo } from "react";
import { useGetProducts, useRefreshAllProducts, getGetProductsQueryKey, type Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Filter, Loader2, PackageOpen, RefreshCw, Bell, TrendingDown } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { SchedulerSettings } from "@/components/SchedulerSettings";
import { AddProductDialog } from "@/components/AddProductDialog";
import { ProductRow } from "@/components/ProductRow";
import { ProductDetailModal } from "@/components/ProductDetailModal";
import { SetAlertModal } from "@/components/SetAlertModal";

function groupProducts(products: Product[]): Map<string, Product[]> {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.productTypeName ?? p.category ?? "Uncategorised";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  for (const group of map.values()) {
    group.sort((a, b) => {
      if (a.isBelowAlert && !b.isBelowAlert) return -1;
      if (!a.isBelowAlert && b.isBelowAlert) return 1;
      return a.name.localeCompare(b.name);
    });
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      if (a === "Uncategorised") return 1;
      if (b === "Uncategorised") return -1;
      return a.localeCompare(b);
    })
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [showDropsOnly, setShowDropsOnly] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [alertProduct, setAlertProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useGetProducts({ 
    search: search || undefined, 
    belowAlert: showDropsOnly || undefined 
  });
  
  const refreshAllMutation = useRefreshAllProducts();
  const queryClient = useQueryClient();

  const groupedProducts = useMemo(() => groupProducts(products), [products]);

  const handleRefreshAll = () => {
    refreshAllMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() })
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Your Watchlist</h1>
          <p className="text-muted-foreground mt-1">Track specific HKTVMall items and get alerted on price drops.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={handleRefreshAll}
            disabled={refreshAllMutation.isPending}
            className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-semibold hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 flex-1 sm:flex-none disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", refreshAllMutation.isPending && "animate-spin")} />
            <span className="hidden sm:inline">Refresh All</span>
          </button>
          <button 
            onClick={() => setIsAddOpen(true)}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 shadow-lg shadow-primary/25 hover:-translate-y-0.5 hover:shadow-xl transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </button>
        </div>
      </div>

      <SchedulerSettings />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-card border border-border/60 p-2 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search watchlist..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-transparent focus:outline-none text-sm font-medium placeholder:font-normal"
          />
        </div>
        <div className="w-px bg-border hidden sm:block mx-1 my-2" />
        <button
          onClick={() => setShowDropsOnly(!showDropsOnly)}
          className={cn(
            "px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
            showDropsOnly ? "bg-primary/10 text-primary" : "bg-transparent text-muted-foreground hover:bg-muted"
          )}
        >
          <Filter className="w-4 h-4" />
          Drops Only
        </button>
      </div>

      {/* Product List */}
      {isLoading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : products.length > 0 ? (
        <div className="flex flex-col gap-8">
          {[...groupedProducts.entries()].map(([category, group]) => {
            const hasAlert = group.some((p) => p.isBelowAlert);
            const hasDrop = !hasAlert && group.some(
              (p) => p.originalPrice !== undefined && p.originalPrice > p.currentPrice
            );

            return (
              <div key={category}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span
                    className={cn(
                      "text-xs font-bold tracking-widest uppercase",
                      hasAlert ? "text-destructive" : hasDrop ? "text-amber-600" : "text-muted-foreground"
                    )}
                  >
                    {category}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                      hasAlert
                        ? "bg-destructive/10 text-destructive"
                        : hasDrop
                        ? "bg-amber-50 border border-amber-200 text-amber-600"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {group.length}
                  </span>
                  <div
                    className={cn(
                      "flex-1 h-px",
                      hasAlert ? "bg-destructive/25" : hasDrop ? "bg-amber-200" : "bg-border"
                    )}
                  />
                  {hasAlert && <Bell className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  {hasDrop && <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                </div>

                {/* Products in this category */}
                <div className="flex flex-col gap-3">
                  {group.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onClick={() => setSelectedProductId(product.id)}
                      onSetAlert={(e) => { e.stopPropagation(); setAlertProduct(product); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-24 flex flex-col items-center justify-center text-center px-4 bg-card border border-border/50 border-dashed rounded-3xl">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <PackageOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Watchlist is empty</h3>
          <p className="text-muted-foreground max-w-md">
            {search || showDropsOnly 
              ? "No products match your current filters." 
              : "Add your first product from HKTVMall to start tracking its price automatically."}
          </p>
          {!(search || showDropsOnly) && (
            <button 
              onClick={() => setIsAddOpen(true)}
              className="mt-6 px-6 py-3 bg-secondary text-secondary-foreground font-semibold rounded-xl hover:bg-secondary/80 transition-colors"
            >
              Add Product
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {isAddOpen && <AddProductDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />}
        {selectedProductId && <ProductDetailModal productId={selectedProductId} onClose={() => setSelectedProductId(null)} />}
        {alertProduct && <SetAlertModal product={alertProduct} onClose={() => setAlertProduct(null)} />}
      </AnimatePresence>
    </div>
  );
}
