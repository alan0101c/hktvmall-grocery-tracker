import { Bell } from "lucide-react";
import { cn, formatHKD } from "@/lib/utils";

export interface CategoryStats {
  name: string;
  count: number;
  minPrice: number;
  maxPrice: number;
  unit: string | null;
  avgDiscountRatio: number | null;
  hasAlert: boolean;
}

interface CategorySidebarProps {
  stats: CategoryStats[];
  activeCategory: string | null;
  onSelect: (cat: string | null) => void;
  totalCount: number;
  variant?: "sidebar" | "chips";
}

function discountColor(ratio: number | null): "green" | "amber" | "red" | "neutral" {
  if (ratio === null) return "neutral";
  if (ratio >= 0.10) return "green";
  if (ratio >= 0.01) return "amber";
  if (ratio < 0) return "red";
  return "neutral";
}

function priceRangeLabel(stat: CategoryStats): string {
  const fmt = (n: number) => formatHKD(n);
  if (stat.minPrice === stat.maxPrice) {
    return stat.unit ? `${fmt(stat.minPrice)}/${stat.unit}` : fmt(stat.minPrice);
  }
  return stat.unit
    ? `${fmt(stat.minPrice)} – ${fmt(stat.maxPrice)}/${stat.unit}`
    : `${fmt(stat.minPrice)} – ${fmt(stat.maxPrice)}`;
}

function SidebarEntry({
  label,
  count,
  priceRange,
  color,
  hasAlert,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  priceRange?: string;
  color: "green" | "amber" | "red" | "neutral";
  hasAlert: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const borderAccent = {
    green: "border-l-emerald-400",
    amber: "border-l-amber-400",
    red: "border-l-red-400",
    neutral: "border-l-border",
  }[color];

  const activeBg = {
    green: "bg-emerald-50 border-emerald-200/60",
    amber: "bg-amber-50 border-amber-200/60",
    red: "bg-red-50 border-red-200/60",
    neutral: "bg-primary/8 border-primary/20",
  }[color];

  const textColor = {
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-600",
    neutral: "text-foreground",
  }[color];

  const subTextColor = {
    green: "text-emerald-600/80",
    amber: "text-amber-600/80",
    red: "text-red-500/80",
    neutral: "text-muted-foreground",
  }[color];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-xl border-l-2 border border-transparent transition-all",
        borderAccent,
        isActive
          ? cn(activeBg, "shadow-sm")
          : "hover:bg-muted/60 border-transparent"
      )}
    >
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span
          className={cn(
            "text-xs font-semibold truncate leading-tight",
            isActive ? textColor : "text-foreground"
          )}
        >
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {hasAlert && <Bell className="w-3 h-3 text-destructive" />}
          <span
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
              isActive
                ? cn(textColor, "bg-white/60")
                : "bg-muted text-muted-foreground"
            )}
          >
            {count}
          </span>
        </div>
      </div>
      {priceRange && (
        <p className={cn("text-[10px] mt-0.5 truncate font-medium", isActive ? subTextColor : "text-muted-foreground")}>
          {priceRange}
        </p>
      )}
    </button>
  );
}

export function CategorySidebar({ stats, activeCategory, onSelect, totalCount, variant = "sidebar" }: CategorySidebarProps) {
  if (variant === "chips") {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap",
            activeCategory === null
              ? "bg-primary text-primary-foreground border-transparent shadow-sm"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
          )}
        >
          All ({totalCount})
        </button>
        {stats.map((stat) => {
          const color = discountColor(stat.avgDiscountRatio);
          const isActive = activeCategory === stat.name;
          const chipColor = {
            green: isActive ? "bg-emerald-600 text-white border-transparent" : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
            amber: isActive ? "bg-amber-500 text-white border-transparent" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
            red: isActive ? "bg-red-500 text-white border-transparent" : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100",
            neutral: isActive ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-foreground hover:border-primary/30",
          }[color];

          return (
            <button
              key={stat.name}
              onClick={() => onSelect(isActive ? null : stat.name)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap shadow-sm",
                chipColor
              )}
            >
              {stat.hasAlert && <Bell className={cn("w-3 h-3", isActive ? "text-white" : "text-destructive")} />}
              {stat.name}
              <span className={cn("text-[10px] font-bold", isActive ? "opacity-80" : "opacity-60")}>
                {stat.count}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-1">
        Categories
      </p>

      <SidebarEntry
        label="All"
        count={totalCount}
        color="neutral"
        hasAlert={false}
        isActive={activeCategory === null}
        onClick={() => onSelect(null)}
      />

      {stats.map((stat) => {
        const color = discountColor(stat.avgDiscountRatio);
        const isActive = activeCategory === stat.name;
        return (
          <SidebarEntry
            key={stat.name}
            label={stat.name}
            count={stat.count}
            priceRange={priceRangeLabel(stat)}
            color={color}
            hasAlert={stat.hasAlert}
            isActive={isActive}
            onClick={() => onSelect(isActive ? null : stat.name)}
          />
        );
      })}
    </div>
  );
}
