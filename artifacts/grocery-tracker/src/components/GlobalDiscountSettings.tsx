import { useState } from "react";
import {
  useGetAppSettings,
  useUpdateAppSettings,
  getGetAppSettingsQueryKey,
  getGetProductsQueryKey,
  getGetAlertsQueryKey,
  getGetTriggeredAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Percent, BadgePercent, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PRESETS = [0, 5, 10, 15, 20];

export function GlobalDiscountSettings() {
  const { data: settings, isLoading } = useGetAppSettings();
  const updateMutation = useUpdateAppSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [percent, setPercent] = useState<string>("0");

  if (isLoading || !settings) {
    return <div className="h-12 w-full animate-pulse bg-muted rounded-xl" />;
  }

  const active = settings.globalDiscountPercent > 0;

  const openEditor = () => {
    setPercent(String(settings.globalDiscountPercent));
    setIsOpen(true);
  };

  const handleSave = () => {
    const value = parseFloat(percent);
    if (isNaN(value) || value < 0 || value > 100) {
      toast({
        title: "Invalid discount",
        description: "Enter a percentage between 0 and 100.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate(
      { data: { globalDiscountPercent: value } },
      {
        onSuccess: () => {
          // Prices, alerts and triggered alerts all depend on the discount.
          queryClient.invalidateQueries({ queryKey: getGetAppSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTriggeredAlertsQueryKey() });
          setIsOpen(false);
          toast({
            title: value > 0 ? `Global discount set to ${value}%` : "Global discount cleared",
            description:
              value > 0
                ? "Displayed prices, unit prices and alerts now reflect the discounted price."
                : "Prices are back to the listed values.",
          });
        },
      }
    );
  };

  return (
    <div className="relative">
      <div className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "p-2.5 rounded-xl flex-shrink-0",
              active ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground"
            )}
          >
            <BadgePercent className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Global Discount
              {active && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  -{settings.globalDiscountPercent}%
                </span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {active
                ? `Sitewide promotion applied — prices show what you actually pay.`
                : "No sitewide promotion. Add one when everything goes on sale (e.g. 全場85折)."}
            </p>
          </div>
        </div>

        <button
          onClick={openEditor}
          className="w-full sm:w-auto px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <Percent className="w-4 h-4" />
          {active ? "Adjust" : "Set Discount"}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-2 right-0 w-full sm:w-80 bg-card rounded-2xl shadow-xl shadow-black/5 border border-border/80 p-5 z-20"
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <BadgePercent className="w-4 h-4 text-amber-600" />
                  Sitewide Discount
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPercent(String(p))}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium transition-all",
                        parseFloat(percent) === p
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                    >
                      {p > 0 ? `${p}%` : "Off"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    placeholder="Custom %"
                    className="w-28 px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-sm transition-colors"
                  />
                  <span className="text-xs text-muted-foreground">% off every listed price</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-border/50">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
                >
                  {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
