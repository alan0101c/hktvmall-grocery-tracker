import { Bell, TrendingDown, Image as ImageIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@workspace/api-client-react";

interface ProductCardProps {
  product: Product;
  onClick: (product: Product) => void;
  onSetAlert: (product: Product, e: React.MouseEvent) => void;
}

export function ProductCard({ product, onClick, onSetAlert }: ProductCardProps) {
  const discount = product.originalPrice && product.originalPrice > product.currentPrice
    ? Math.round((1 - product.currentPrice / product.originalPrice) * 100)
    : 0;

  return (
    <div 
      onClick={() => onClick(product)}
      className="group flex flex-col bg-card rounded-2xl border border-border shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 overflow-hidden cursor-pointer h-full"
    >
      <div className="relative aspect-square p-6 flex items-center justify-center bg-white">
        {product.imageUrl ? (
          <img 
            src={product.imageUrl} 
            alt={product.name}
            className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-500 mix-blend-multiply"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        )}
        
        {/* Badges container */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
          {discount > 0 && (
            <Badge className="bg-destructive text-destructive-foreground font-bold shadow-sm">
              -{discount}%
            </Badge>
          )}
          {product.isBelowAlert && (
            <Badge className="bg-primary animate-in fade-in zoom-in duration-300 text-primary-foreground shadow-md shadow-primary/20 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Target Hit
            </Badge>
          )}
        </div>

        {/* Action button */}
        <button
          onClick={(e) => onSetAlert(product, e)}
          className={`absolute top-3 right-3 p-2.5 rounded-full backdrop-blur-md transition-all duration-200 ${
            product.alertPrice 
              ? "bg-primary text-primary-foreground shadow-md" 
              : "bg-background/80 text-muted-foreground hover:bg-background hover:text-primary hover:shadow-md border border-border/50"
          }`}
          title={product.alertPrice ? `Alert set at HK$${product.alertPrice}` : "Set price alert"}
        >
          <Bell className={`w-4 h-4 ${product.alertPrice ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="flex flex-col flex-grow p-5 border-t border-border/50 bg-card">
        {product.brand && (
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-1">
            {product.brand}
          </span>
        )}
        
        <h3 className="font-display font-medium text-foreground line-clamp-2 leading-snug mb-3 flex-grow group-hover:text-primary transition-colors">
          {product.name}
        </h3>
        
        <div className="mt-auto">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold text-foreground">
              {product.currency}{product.currentPrice.toFixed(2)}
            </span>
            {product.originalPrice && product.originalPrice > product.currentPrice && (
              <span className="text-sm text-muted-foreground line-through decoration-destructive/50">
                {product.currency}{product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
          
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span className="truncate max-w-[60%]">{product.category || "Uncategorized"}</span>
            <span className="whitespace-nowrap flex-shrink-0">
              Updated {formatDistanceToNow(new Date(product.lastUpdated), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
