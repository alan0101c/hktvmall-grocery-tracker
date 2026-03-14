import { useState } from "react";
import { useGetScheduler, useUpdateScheduler, getGetSchedulerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Settings2, Power, AlertCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function SchedulerSettings() {
  const { data: scheduler, isLoading } = useGetScheduler();
  const updateMutation = useUpdateScheduler();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(scheduler?.enabled ?? true);
  const [interval, setIntervalHours] = useState(scheduler?.intervalHours ?? 6);

  if (isLoading || !scheduler) {
    return <div className="h-12 w-full animate-pulse bg-muted rounded-xl" />;
  }

  const handleSave = () => {
    updateMutation.mutate(
      { data: { enabled, intervalHours: interval } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSchedulerQueryKey() });
          setIsOpen(false);
          toast({ title: "Scheduler updated", description: "Your tracking preferences have been saved." });
        },
      }
    );
  };

  const nextRunText = scheduler.enabled && scheduler.nextRun 
    ? `Next check in ${formatDistanceToNow(new Date(scheduler.nextRun))}` 
    : "Scheduler paused";

  return (
    <div className="relative mb-8">
      <div className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={cn("p-2.5 rounded-xl flex-shrink-0", scheduler.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Automatic Tracking
              {!scheduler.enabled && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Paused</span>}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {nextRunText}
              {scheduler.lastRun && <span className="hidden sm:inline"> • Last checked {formatDistanceToNow(new Date(scheduler.lastRun))} ago</span>}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full sm:w-auto px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Configure
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
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold flex items-center gap-2 cursor-pointer">
                  <Power className={cn("w-4 h-4", enabled ? "text-primary" : "text-muted-foreground")} />
                  Enable Auto-Check
                </label>
                <button 
                  onClick={() => setEnabled(!enabled)}
                  className={cn("w-12 h-6 rounded-full transition-colors relative", enabled ? "bg-primary" : "bg-muted-foreground/30")}
                >
                  <span className={cn("absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform", enabled ? "translate-x-6" : "translate-x-0")} />
                </button>
              </div>

              <div className={cn("space-y-3 transition-opacity", !enabled && "opacity-50 pointer-events-none")}>
                <label className="text-sm font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  Check Interval
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 3, 6, 12, 24].map((h) => (
                    <button
                      key={h}
                      onClick={() => setIntervalHours(h)}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium transition-all",
                        interval === h 
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-border/50">
                <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Config"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
