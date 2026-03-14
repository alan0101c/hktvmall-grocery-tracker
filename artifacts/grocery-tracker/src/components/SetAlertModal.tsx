import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Bell, Loader2 } from "lucide-react";
import { useCreateAlert, useDeleteAlert, getGetProductsQueryKey, getGetAlertsQueryKey, type Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatHKD } from "@/lib/utils";

interface SetAlertModalProps {
  product: Product | null;
  onClose: () => void;
}

export function SetAlertModal({ product, onClose }: SetAlertModalProps) {
  const [targetPrice, setTargetPrice] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreateAlert();

  useEffect(() => {
    if (product) {
      setTargetPrice(product.alertPrice ? product.alertPrice.toString() : (product.currentPrice * 0.9).toFixed(2));
    }
  }, [product]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !targetPrice) return;

    createMutation.mutate(
      { data: { productId: product.id, targetPrice: parseFloat(targetPrice) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
          toast({ title: "Alert Set!", description: `We'll notify you when ${product.name} drops below ${formatHKD(parseFloat(targetPrice))}.` });
          onClose();
        }
      }
    );
  };

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 text-primary">
            <div className="p-2 bg-primary/10 rounded-xl"><Bell className="w-6 h-6" /></div>
            <h2 className="text-xl font-bold text-foreground">Set Price Alert</h2>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 items-center p-4 bg-muted/50 rounded-2xl mb-6">
          <div className="w-12 h-12 rounded-lg bg-white border border-border p-1 shrink-0">
            {product.imageUrl && <img src={product.imageUrl} alt="" className="w-full h-full object-contain" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{product.name}</p>
            <p className="text-muted-foreground text-xs mt-0.5">Current: {formatHKD(product.currentPrice)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Target Price (HKD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">HK$</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-lg"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">We'll alert you when the price drops to or below this amount.</p>
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:-translate-y-0.5 shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:transform-none"
          >
            {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Alert"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
