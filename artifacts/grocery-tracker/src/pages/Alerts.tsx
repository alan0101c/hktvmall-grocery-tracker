import { useGetAlerts, useDeleteAlert, useGetTriggeredAlerts, getGetAlertsQueryKey, getGetTriggeredAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, Bell, Trash2, ExternalLink, ArrowDownRight, Loader2 } from "lucide-react";
import { formatHKD, cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function AlertsPage() {
  const { data: alerts = [], isLoading: alertsLoading } = useGetAlerts();
  const { data: triggered = [], isLoading: triggeredLoading } = useGetTriggeredAlerts();
  const deleteMutation = useDeleteAlert();
  const queryClient = useQueryClient();

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTriggeredAlertsQueryKey() });
      }
    });
  };

  const isLoading = alertsLoading || triggeredLoading;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Bell className="w-8 h-8 text-primary" />
          Price Alerts
        </h1>
        <p className="text-muted-foreground mt-2">Manage your target prices and see what's on sale.</p>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-10">
          {/* Triggered Section */}
          {triggered.length > 0 && (
            <section>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-primary">
                <BellRing className="w-5 h-5" />
                Action Required ({triggered.length})
              </h2>
              <div className="grid gap-4">
                {triggered.map((alert) => (
                  <div key={`trig-${alert.alertId}`} className="bg-primary/10 border-2 border-primary/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-sm shadow-primary/5">
                    <div className="w-16 h-16 bg-white rounded-xl border border-primary/20 p-1 shrink-0">
                      {alert.imageUrl && <img src={alert.imageUrl} alt="" className="w-full h-full object-contain" />}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-foreground leading-tight mb-1">{alert.productName}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="text-primary font-bold text-base">{formatHKD(alert.currentPrice)}</span>
                        <span className="text-muted-foreground line-through">Target: {formatHKD(alert.targetPrice)}</span>
                        <span className="flex items-center gap-1 font-semibold text-primary bg-white px-2 py-0.5 rounded-md border border-primary/20 shadow-sm">
                          <ArrowDownRight className="w-3 h-3" /> Save {formatHKD(alert.savings)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                      {alert.productUrl && (
                        <a 
                          href={alert.productUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex-1 sm:flex-none px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors flex justify-center items-center gap-2 shadow-md shadow-primary/20"
                        >
                          Buy Now <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button 
                        onClick={() => handleDelete(alert.alertId)}
                        className="p-2 bg-white text-destructive border border-border hover:bg-destructive/10 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All Alerts Section */}
          <section>
            <h2 className="text-xl font-bold mb-4">All Monitored Targets</h2>
            {alerts.length === 0 ? (
              <div className="bg-card border border-border/50 border-dashed rounded-2xl p-8 text-center text-muted-foreground">
                No active alerts. Add an alert from your watchlist to get started.
              </div>
            ) : (
              <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
                <div className="divide-y divide-border/50">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{alert.productName}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm">
                          <span className="font-medium text-muted-foreground">Target: <span className="text-foreground">{formatHKD(alert.targetPrice)}</span></span>
                          <span className="text-border">•</span>
                          <span className="text-muted-foreground">Current: {formatHKD(alert.currentPrice)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Created {formatDistanceToNow(new Date(alert.createdAt))} ago</p>
                      </div>
                      
                      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-semibold border",
                          alert.isTriggered 
                            ? "bg-primary/10 text-primary border-primary/20" 
                            : "bg-secondary text-secondary-foreground border-transparent"
                        )}>
                          {alert.isTriggered ? "Triggered" : "Waiting"}
                        </span>
                        <button 
                          onClick={() => handleDelete(alert.id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
