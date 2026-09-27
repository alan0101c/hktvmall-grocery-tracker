import { motion } from "framer-motion";
import { X, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useGetProduct } from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatHKD } from "@/lib/utils";

interface ProductDetailModalProps {
  productId: number;
  onClose: () => void;
}

function formatHKT(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-HK", {
    ...opts,
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(dateStr));
}

function formatAxisDate(dateStr: string): string {
  return formatHKT(dateStr, { month: "short", day: "numeric" });
}

function formatTooltipDate(dateStr: string): string {
  return formatHKT(dateStr, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { inStock?: boolean };
  stroke?: string;
}

function CustomDot({ cx, cy, payload, stroke }: CustomDotProps) {
  if (cx == null || cy == null) return null;
  const inStock = payload?.inStock !== false;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={inStock ? "hsl(var(--background))" : "#9ca3af"}
      stroke={inStock ? (stroke ?? "hsl(var(--primary))") : "#9ca3af"}
      strokeWidth={2}
    />
  );
}

interface CustomActiveDotProps {
  cx?: number;
  cy?: number;
  stroke?: string;
}

function CustomActiveDot({ cx, cy, stroke }: CustomActiveDotProps) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={stroke ?? "hsl(var(--primary))"}
      stroke="none"
    />
  );
}

export function ProductDetailModal({ productId, onClose }: ProductDetailModalProps) {
  const { data: product, isLoading } = useGetProduct(productId);

  if (!productId) return null;

  const priceHistory = product?.priceHistory ?? [];

  const hasPlusPrice = priceHistory.some((h) => h.plusPrice != null);

  const allPrices: number[] = [];
  for (const h of priceHistory) {
    allPrices.push(h.price);
    if (h.plusPrice != null) allPrices.push(h.plusPrice);
  }
  const historicalLow = allPrices.length > 0 ? Math.min(...allPrices) : null;

  // HKTVmall Plus was cancelled; legacy rows may still carry a plusPrice,
  // but it must never be preferred over the real current price.
  const effectivePrice = product?.adjustedPrice ?? product?.currentPrice ?? null;

  const globalDiscountPercent = product?.globalDiscountPercent ?? 0;

  let gapPercent: number | null = null;
  let gapLabel: string | null = null;
  if (historicalLow != null && effectivePrice != null) {
    if (Math.abs(effectivePrice - historicalLow) < 0.001) {
      gapLabel = "At historical low";
    } else {
      gapPercent = Math.round(((effectivePrice - historicalLow) / historicalLow) * 100);
      gapLabel = `+${gapPercent}% above historical low`;
    }
  }

  const displayCurrentPrice = effectivePrice ?? product?.currentPrice;

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
                  <p className="text-2xl font-bold text-primary">{formatHKD(displayCurrentPrice ?? product.currentPrice)}</p>
                  {product.plusPrice != null && (
                    <p className="text-xs text-[#00b050] font-medium mt-1">Plus: {formatHKD(product.plusPrice)}</p>
                  )}
                  {globalDiscountPercent > 0 && product.adjustedPrice != null && (
                    <p className="text-xs text-amber-600 font-medium mt-1">
                      全場 -{globalDiscountPercent}% applied (listed: {formatHKD(product.currentPrice)})
                    </p>
                  )}
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
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-lg">Price History</h3>
                  {hasPlusPrice && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-0.5 bg-primary rounded" />
                        Regular
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-0.5 bg-[#00b050] rounded" />
                        Plus
                      </span>
                    </div>
                  )}
                </div>
                <div className="h-64 w-full bg-white border border-border/50 rounded-2xl p-4">
                  {priceHistory.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={priceHistory}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="recordedAt"
                          tickFormatter={(val) => formatAxisDate(val)}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          dy={10}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tickFormatter={(val) => `HK$${val}`}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          dx={-10}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            formatHKD(value),
                            name === "price" ? "Regular Price" : "Plus Price",
                          ]}
                          labelFormatter={(label: string) => formatTooltipDate(label)}
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                        />
                        {historicalLow != null && (
                          <ReferenceLine
                            y={historicalLow}
                            stroke="#f59e0b"
                            strokeDasharray="4 3"
                            label={{
                              value: `Historical Low: ${formatHKD(historicalLow)}`,
                              position: "insideTopRight",
                              fill: "#f59e0b",
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="hsl(var(--primary))"
                          strokeWidth={3}
                          dot={(props) => <CustomDot key={`dot-price-${props.index}`} {...props} stroke="hsl(var(--primary))" />}
                          activeDot={(props) => <CustomActiveDot key={`adot-price-${props.index}`} {...props} stroke="hsl(var(--primary))" />}
                        />
                        {hasPlusPrice && (
                          <Line
                            type="monotone"
                            dataKey="plusPrice"
                            stroke="#00b050"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            connectNulls={false}
                            dot={(props) => <CustomDot key={`dot-plus-${props.index}`} {...props} stroke="#00b050" />}
                            activeDot={(props) => <CustomActiveDot key={`adot-plus-${props.index}`} {...props} stroke="#00b050" />}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Not enough data yet
                    </div>
                  )}
                </div>
                {gapLabel && (
                  <p className="text-sm text-center text-muted-foreground">
                    {gapLabel === "At historical low" ? (
                      <span className="text-[#00b050] font-semibold">At historical low</span>
                    ) : (
                      <span className="text-amber-600 font-medium">{gapLabel}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
