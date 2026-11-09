import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Navbar } from "@/components/layout/Navbar";
import OverviewPage from "@/pages/Overview";
import ProductsPage from "@/pages/Products";
import AlertsPage from "@/pages/Alerts";
import PromotionsPage from "@/pages/Promotions";
import ProductTypesPage from "@/pages/ProductTypes";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1 * 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

function Router() {
  return (
    <div className="min-h-screen flex flex-col w-full bg-background selection:bg-primary/20 selection:text-primary">
      <Navbar />
      <div className="flex-grow">
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/watchlist" component={ProductsPage} />
          <Route path="/alerts" component={AlertsPage} />
          <Route path="/promotions" component={PromotionsPage} />
          <Route path="/product-types" component={ProductTypesPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
