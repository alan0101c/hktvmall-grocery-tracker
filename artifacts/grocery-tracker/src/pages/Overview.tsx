import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import {
  getGetCategoryOverviewQueryKey,
  useGetCategoryOverview,
  type CategoryOverview,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type SortKey =
  | "bigCategory"
  | "subCategory"
  | "name"
  | "cheapestPricePerUnit"
  | "unit"
  | "historicalLow"
  | "awayFromLow"
  | "recommendation";
type SortDirection = "asc" | "desc";
type Recommendation = "buy" | "wait" | "no-data";

type OverviewRow = CategoryOverview & {
  awayFromLow: number | null;
  recommendation: Recommendation;
};

const priceFormatter = new Intl.NumberFormat("en-HK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dateFormatter = new Intl.DateTimeFormat("en-HK", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatPrice(price: number) {
  return `HK$${priceFormatter.format(price)}`;
}

function formatDistance(distance: number) {
  if (Math.abs(distance) < 0.05) return "0.0%";
  return `${distance > 0 ? "+" : ""}${distance.toFixed(1)}%`;
}

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "bigCategory", label: "Big category" },
  { key: "subCategory", label: "Sub-category" },
  { key: "name", label: "Name" },
  { key: "cheapestPricePerUnit", label: "Cheapest / unit", numeric: true },
  { key: "unit", label: "Unit" },
  { key: "historicalLow", label: "Historical low", numeric: true },
  { key: "awayFromLow", label: "Away from low", numeric: true },
  { key: "recommendation", label: "Recommendation" },
];

const recommendationRank: Record<Recommendation, number> = { buy: 0, wait: 1, "no-data": 2 };

export default function OverviewPage() {
  const [threshold, setThreshold] = useState(5);
  const [sortKey, setSortKey] = useState<SortKey>("bigCategory");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { data = [], isLoading, error, refetch } = useGetCategoryOverview({
    query: { queryKey: getGetCategoryOverviewQueryKey(), refetchOnMount: "always" },
  });

  const rows = useMemo<OverviewRow[]>(
    () =>
      data.map((row) => {
        const awayFromLow =
          row.cheapestPricePerUnit != null && row.historicalLow != null && row.historicalLow > 0
            ? ((row.cheapestPricePerUnit - row.historicalLow) / row.historicalLow) * 100
            : null;
        return {
          ...row,
          awayFromLow,
          recommendation: awayFromLow == null ? "no-data" : awayFromLow <= threshold ? "buy" : "wait",
        };
      }),
    [data, threshold],
  );

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (aValue == null && bValue != null) return 1;
      if (aValue != null && bValue == null) return -1;

      let comparison = 0;
      if (sortKey === "recommendation") {
        comparison = recommendationRank[a.recommendation] - recommendationRank[b.recommendation];
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue ?? "").localeCompare(String(bValue ?? ""));
      }
      if (comparison === 0) {
        comparison =
          a.bigCategory.localeCompare(b.bigCategory) ||
          a.subCategory.localeCompare(b.subCategory) ||
          a.name.localeCompare(b.name);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [rows, sortDirection, sortKey]);

  const buyCount = rows.filter((row) => row.recommendation === "buy").length;

  const changeSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-7">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Price Overview</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            The best current unit price for every category, compared with its recorded low.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start lg:self-auto bg-card border border-border/70 rounded-2xl px-4 py-3 shadow-sm">
          <label htmlFor="buy-threshold" className="text-sm font-semibold text-foreground">
            Buy when within
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="buy-threshold"
              type="number"
              min="0"
              step="0.5"
              value={threshold}
              onChange={(event) => {
                if (Number.isFinite(event.target.valueAsNumber)) {
                  setThreshold(Math.max(0, event.target.valueAsNumber));
                }
              }}
              className="w-20 px-2.5 py-1.5 text-right font-bold bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
            <span className="text-sm text-muted-foreground">of low</span>
          </div>
        </div>
      </div>

      {!isLoading && !error && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-sm">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{rows.length}</strong> categories
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
            <ShoppingCart className="w-4 h-4" />
            {buyCount} buy opportunit{buyCount === 1 ? "y" : "ies"}
          </span>
          <span className="text-xs text-muted-foreground">Select any column to sort</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-24 flex justify-center bg-card border border-border/60 rounded-3xl">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="py-20 px-6 flex flex-col items-center text-center bg-card border border-destructive/20 rounded-3xl">
          <CircleAlert className="w-9 h-9 text-destructive mb-3" />
          <h2 className="text-lg font-bold">Couldn’t load the overview</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-24 px-6 flex flex-col items-center text-center bg-card border border-border/60 border-dashed rounded-3xl">
          <LayoutDashboard className="w-10 h-10 text-primary mb-4" />
          <h2 className="text-xl font-bold">No categories yet</h2>
          <p className="text-muted-foreground mt-2 mb-5">Create a category to start comparing unit prices.</p>
          <Link
            href="/product-types"
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            Go to Categories
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border/70 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  {columns.map((column) => {
                    const active = sortKey === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                        className={cn("px-4 py-3", column.numeric ? "text-right" : "text-left")}
                      >
                        <button
                          onClick={() => changeSort(column.key)}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
                            column.numeric && "flex-row-reverse",
                            active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {column.label}
                          {active ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedRows.map((row) => (
                  <tr
                    key={row.productTypeId}
                    className={cn(
                      "transition-colors hover:bg-muted/35",
                      row.recommendation === "buy" && "bg-emerald-50/45 hover:bg-emerald-50/70",
                    )}
                  >
                    <td className="px-4 py-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      {row.bigCategory || "—"}
                    </td>
                    <td className="px-4 py-4 font-medium text-muted-foreground">{row.subCategory || "—"}</td>
                    <td className="px-4 py-4 font-semibold text-foreground">
                      {row.productUrl ? (
                        <a
                          href={row.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open the cheapest current listing on HKTVmall"
                          className="inline-flex items-center gap-1.5 underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                        >
                          {row.name}
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                        </a>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-foreground whitespace-nowrap">
                      {row.cheapestPricePerUnit == null ? "—" : formatPrice(row.cheapestPricePerUnit)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-muted font-mono text-xs">{row.unit}</span>
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      {row.historicalLow == null ? (
                        "—"
                      ) : (
                        <>
                          <div className="font-semibold">{formatPrice(row.historicalLow)}</div>
                          {row.historicalLowDate && (
                            <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-0.5">
                              <Clock3 className="w-3 h-3" />
                              {dateFormatter.format(new Date(row.historicalLowDate))}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-4 text-right font-bold whitespace-nowrap",
                        row.recommendation === "buy" ? "text-emerald-700" : "text-muted-foreground",
                      )}
                    >
                      {row.awayFromLow == null ? "—" : formatDistance(row.awayFromLow)}
                    </td>
                    <td className="px-4 py-4">
                      {row.recommendation === "buy" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          <ShoppingCart className="w-3.5 h-3.5" /> Buy
                        </span>
                      ) : row.recommendation === "wait" ? (
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-bold">
                          Wait
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No data</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border/60 bg-muted/25 text-xs text-muted-foreground">
            Current prices exclude unavailable listings. Historical lows include every recorded listing in the category.
          </div>
        </div>
      )}
    </main>
  );
}
