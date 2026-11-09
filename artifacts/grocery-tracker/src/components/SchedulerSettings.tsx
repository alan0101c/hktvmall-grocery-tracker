import { useEffect, useState } from "react";
import { useGetScheduler, useUpdateScheduler, getGetSchedulerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Power, RefreshCw, Gauge, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SchedulerSettings() {
  const { data: scheduler, isLoading } = useGetScheduler();
  const updateMutation = useUpdateScheduler();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState(6);
  const [requestDelaySeconds, setRequestDelaySeconds] = useState("3");

  useEffect(() => {
    if (!scheduler) return;
    setEnabled(scheduler.enabled);
    setIntervalHours(scheduler.intervalHours);
    setRequestDelaySeconds(String((scheduler.requestDelayMs ?? 3000) / 1000));
  }, [scheduler]);

  if (isLoading || !scheduler) {
    return <div className="h-80 w-full animate-pulse rounded-2xl bg-muted" />;
  }

  const delaySeconds = Number(requestDelaySeconds);
  const isDelayValid = requestDelaySeconds.trim() !== "" && Number.isInteger(delaySeconds) && delaySeconds >= 0;
  const productsPerMinute = isDelayValid && delaySeconds > 0
    ? Number((60 / delaySeconds).toFixed(1))
    : null;

  const resetForm = () => {
    setEnabled(scheduler.enabled);
    setIntervalHours(scheduler.intervalHours);
    setRequestDelaySeconds(String((scheduler.requestDelayMs ?? 3000) / 1000));
  };

  const handleSave = () => {
    if (!isDelayValid) return;
    updateMutation.mutate(
      { data: { enabled, intervalHours, requestDelayMs: delaySeconds * 1000 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSchedulerQueryKey() });
          toast({ title: "Settings updated", description: "Your automatic tracking preferences have been saved." });
        },
        onError: (error) => {
          toast({ title: "Could not save settings", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  const nextRunText = scheduler.enabled && scheduler.nextRun
    ? `Next check in ${formatDistanceToNow(new Date(scheduler.nextRun))}`
    : "Automatic tracking is paused";

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className={cn("rounded-xl p-2.5", scheduler.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Automatic Tracking</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{nextRunText}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="automatic-tracking" className="flex items-center gap-2">
            <Power className={cn("h-4 w-4", enabled ? "text-primary" : "text-muted-foreground")} />
            Enabled
          </Label>
          <Switch id="automatic-tracking" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="space-y-3">
          <Label className="flex items-center gap-2 font-semibold">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Check Interval
          </Label>
          <p className="text-sm text-muted-foreground">How often the background price check starts.</p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 3, 6, 12, 24].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => setIntervalHours(hours)}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-all",
                  intervalHours === hours
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {hours}h
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-6">
          <Label htmlFor="request-delay" className="flex items-center gap-2 font-semibold">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            Delay Between Products
          </Label>
          <p className="text-sm text-muted-foreground">
            Minimum time between automatic product-page request start times.
          </p>
          <div className="flex items-center gap-3">
            <Input
              id="request-delay"
              type="number"
              min="0"
              step="1"
              value={requestDelaySeconds}
              onChange={(event) => setRequestDelaySeconds(event.target.value)}
              className="h-11 max-w-32 rounded-xl"
              aria-describedby="request-delay-help"
            />
            <span className="text-sm font-medium text-muted-foreground">seconds</span>
          </div>
          <p id="request-delay-help" className={cn("text-sm", isDelayValid ? "text-muted-foreground" : "text-destructive")}>
            {!isDelayValid
              ? "Enter a whole number of seconds (0 or more)."
              : productsPerMinute === null
                ? "Throttling disabled; automatic checks still run one product at a time."
                : `About ${productsPerMinute} products per minute at most.`}
          </p>
          <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            Scraping time counts toward this delay. Manual Refresh All on the Watchlist remains unthrottled.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 pt-5">
          <Button type="button" variant="ghost" onClick={resetForm} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!isDelayValid || updateMutation.isPending} className="rounded-xl px-5">
            {updateMutation.isPending && <Loader2 className="animate-spin" />}
            {updateMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>

      {scheduler.lastRun && (
        <div className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground sm:px-6">
          Last automatic check {formatDistanceToNow(new Date(scheduler.lastRun))} ago
        </div>
      )}
    </section>
  );
}
