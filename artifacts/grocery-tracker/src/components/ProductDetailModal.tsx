import { motion } from "framer-motion";
import { X, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useGetProduct } from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { formatHKD } from "@/lib/utils";

interface ProductDetailModalProps {
  productId: number;
  onClose: () => void;
}

export function ProductDetailModal({ productId, onClose }: ProductDetailModalProps) {
  const { data: product, isLoading } = useGetProduct(productId);

  if (!productId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-3xl bg-card rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {isLoading || !product ? (
          <div className="p-12 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-start justify-between p-6 border-b border-border/50">
              <div className="flex gap-4 items-center">
                <div className="w-16 h-16 rounded-xl bg-white border border-border p-2 flex shrink-0">
                  {product.imageUrl && <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
                  <p className="text-muted-foreground text-sm mt-1">{product.brand}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="bg-muted/50 p-4 rounded-2xl border border-border/50">
                  <p className="text-sm text-muted-foreground font-medium mb-1">Current Price</p>
                  <p className="text-2xl font-bold text-primary">{formatHKD(product.currentPrice)}</p>
                </div>
                <div className="bg-muted/50 p-4 rounded-2xl border border-border/50">
                  <p className="text-sm text-muted-foreground font-medium mb-1">Alert Target</p>
                  <p className="text-2xl font-bold">{product.alertPrice ? formatHKD(product.alertPrice) : "Not Set"}</p>
                </div>
                <div className="bg-muted/50 p-4 rounded-2xl border border-border/50">
                  <p className="text-sm text-muted-foreground font-medium mb-1">Last Change</p>
                  <div className="flex items-center gap-1">
                    {product.priceChange ? (
                      product.priceChange < 0 ? (
                        <><TrendingDown className="w-5 h-5 text-primary" /><span className="text-xl font-bold text-primary">{formatHKD(Math.abs(product.priceChange))}</span></>
                      ) : (
                        <><TrendingUp className="w-5 h-5 text-destructive" /><span className="text-xl font-bold text-destructive">{formatHKD(product.priceChange)}</span></>
                      )
                    ) : (
                      <><Minus className="w-5 h-5 text-muted-foreground" /><span className="text-xl font-bold text-muted-foreground">No Change</span></>
                    )}
                  </div>
                </div>
                <div className="bg-muted/50 p-4 rounded-2xl border border-border/50">
                  <p className="text-sm text-muted-foreground font-medium mb-1">Status</p>
                  <p className="text-xl font-bold">{product.inStock ? "In Stock" : "Out of Stock"}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-display font-bold text-lg">Price History</h3>
                <div className="h-64 w-full bg-white border border-border/50 rounded-2xl p-4">
                  {product.priceHistory && product.priceHistory.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={product.priceHistory}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="recordedAt" 
                          tickFormatter={(val) => format(parseISO(val), 'MMM d')} 
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          dy={10}
                        />
                        <YAxis 
                          domain={['auto', 'auto']}
                          tickFormatter={(val) => `HK$${val}`}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          dx={-10}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatHKD(value), "Price"]}
                          labelFormatter={(label: string) => format(parseISO(label), 'PPP p')}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="price" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: "hsl(var(--background))", strokeWidth: 2 }}
                          activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Not enough data yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
