import { BadgePercent } from "lucide-react";
import type { AppliedPromotion } from "@workspace/api-client-react";
import { cn, formatHKD } from "@/lib/utils";

interface AppliedPromotionBadgeProps {
  promotion?: AppliedPromotion | null;
  adjustedPrice?: number;
  compact?: boolean;
  className?: string;
}

export function AppliedPromotionBadge({
  promotion,
  adjustedPrice,
  compact = false,
  className,
}: AppliedPromotionBadgeProps) {
  if (!promotion) return null;

  const conditional = promotion.application === "conditional";
  const total = conditional && adjustedPrice != null && promotion.minimumQuantity != null
    ? adjustedPrice * promotion.minimumQuantity
    : null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        conditional ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700",
        className,
      )}
      title={`${promotion.label}${promotion.assumption ? ` · ${promotion.assumption}` : ""}`}
    >
      <BadgePercent className="h-3 w-3 shrink-0" />
      <span>-{promotion.discountPercent}%</span>
      <span className={cn("font-normal", compact && "truncate")}>· {promotion.label}</span>
      {!compact && conditional && promotion.assumption && (
        <span className="basis-full pl-4 font-normal">{promotion.assumption}</span>
      )}
      {!compact && total != null && (
        <span className="basis-full pl-4 font-normal">
          Total for {promotion.minimumQuantity}: {formatHKD(total)}
        </span>
      )}
    </span>
  );
}
