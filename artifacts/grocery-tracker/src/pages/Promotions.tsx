import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  BadgePercent,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Loader2,
  Package2,
  Pencil,
  Sparkles,
  Tag,
  XCircle,
} from "lucide-react";
import {
  getGetAlertsQueryKey,
  getGetCategoryOverviewQueryKey,
  getGetProductQueryKey,
  getGetProductsQueryKey,
  getGetPromotionsQueryKey,
  getGetTriggeredAlertsQueryKey,
  useGetPromotions,
  useUpdatePromotion,
} from "@workspace/api-client-react";
import type {
  PromotionRule,
  UpdatePromotionRequest,
} from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUSES = ["pending", "approved", "rejected"] as const;

type PromotionStatus = (typeof STATUSES)[number];
type PromotionApplication = UpdatePromotionRequest["application"];
type RuleValues = Pick<
  PromotionRule,
  "discountPercent" | "application" | "minimumQuantity" | "assumption"
>;

type PromotionFormState = {
  status: PromotionStatus;
  discountPercent: string;
  application: PromotionApplication;
  minimumQuantity: string;
  assumption: string;
};

const STATUS_LABELS: Record<PromotionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const EMPTY_MESSAGES: Record<PromotionStatus, string> = {
  pending: "No promotions are waiting for review.",
  approved: "Approved promotions will appear here.",
  rejected: "Rejected promotions will appear here.",
};

function applicationLabel(application: PromotionApplication) {
  if (application === "automatic") return "Automatic";
  if (application === "conditional") return "Conditional";
  return "Not applicable";
}

function isValidPercent(value: number | null) {
  return value != null && Number.isFinite(value) && value > 0 && value < 100;
}

function approvalFromSuggestion(rule: PromotionRule): UpdatePromotionRequest | null {
  const suggestion = rule.suggestion;
  if (
    !isValidPercent(suggestion.discountPercent) ||
    (suggestion.application !== "automatic" && suggestion.application !== "conditional")
  ) {
    return null;
  }

  if (suggestion.application === "conditional") {
    if (
      !Number.isInteger(suggestion.minimumQuantity) ||
      (suggestion.minimumQuantity ?? 0) < 2 ||
      !suggestion.assumption?.trim()
    ) {
      return null;
    }
  }

  return {
    status: "approved",
    discountPercent: suggestion.discountPercent,
    application: suggestion.application,
    minimumQuantity:
      suggestion.application === "conditional" ? suggestion.minimumQuantity : null,
    assumption:
      suggestion.application === "conditional" ? suggestion.assumption!.trim() : null,
  };
}

function inactiveRule(status: "pending" | "rejected"): UpdatePromotionRequest {
  return {
    status,
    discountPercent: null,
    application: "not_applicable",
    minimumQuantity: null,
    assumption: null,
  };
}

function errorMessage(error: unknown) {
  return (
    (error as Error)?.message?.replace(/^HTTP \d+[^:]+:\s*/, "") ||
    "Please try again."
  );
}

function StatusBadge({ status }: { status: PromotionStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
        status === "approved" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "rejected" && "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {status === "pending" && <Clock3 className="h-3 w-3" />}
      {status === "approved" && <CheckCircle2 className="h-3 w-3" />}
      {status === "rejected" && <XCircle className="h-3 w-3" />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function ValuesPanel({
  title,
  values,
  suggested = false,
}: {
  title: string;
  values: RuleValues;
  suggested?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border p-4",
        suggested ? "border-border/70 bg-muted/30" : "border-primary/15 bg-primary/[0.035]"
      )}
    >
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {suggested ? <Sparkles className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {title}
      </h3>
      <dl className="space-y-2.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-right font-semibold text-foreground">
            {values.discountPercent != null ? `${values.discountPercent}% off` : "—"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Application</dt>
          <dd className="text-right font-medium text-foreground">
            {applicationLabel(values.application)}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Minimum quantity</dt>
          <dd className="text-right font-medium text-foreground">
            {values.minimumQuantity ?? "—"}
          </dd>
        </div>
        <div className="space-y-1 border-t border-border/50 pt-2.5">
          <dt className="text-muted-foreground">Assumption</dt>
          <dd className="break-words text-sm font-medium leading-relaxed text-foreground">
            {values.assumption || "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function PromotionCard({
  rule,
  isMutating,
  mutationPending,
  onEdit,
  onSave,
}: {
  rule: PromotionRule;
  isMutating: boolean;
  mutationPending: boolean;
  onEdit: () => void;
  onSave: (rule: PromotionRule, data: UpdatePromotionRequest) => void;
}) {
  const approval = approvalFromSuggestion(rule);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Raw promotion label
            </p>
            <h2 className="break-words font-display text-lg font-bold leading-snug text-foreground">
              {rule.label}
            </h2>
          </div>
          <StatusBadge status={rule.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ValuesPanel title="Suggestion" values={rule.suggestion} suggested />
          <ValuesPanel title="Reviewed values" values={rule} />
        </div>

        <details className="group mt-4 rounded-xl border border-border/60 bg-background">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <Package2 className="h-4 w-4 text-primary" />
            <span className="flex-1">
              {rule.affectedProductCount} affected product{rule.affectedProductCount === 1 ? "" : "s"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="max-h-52 space-y-1 overflow-y-auto border-t border-border/60 px-3 py-2">
            {rule.affectedProducts.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                This label is not currently attached to a watched product.
              </p>
            ) : (
              rule.affectedProducts.map((product) =>
                product.productUrl ? (
                  <a
                    key={product.id}
                    href={product.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group/link flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                  >
                    <span className="min-w-0 flex-1 break-words leading-relaxed">{product.name}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="sr-only">Open product in a new tab</span>
                  </a>
                ) : (
                  <div
                    key={product.id}
                    className="px-2 py-2 text-xs font-medium leading-relaxed text-muted-foreground"
                  >
                    {product.name}
                  </div>
                )
              )
            )}
          </div>
        </details>
      </div>

      <div className="mt-auto border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-6">
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Last seen {formatDistanceToNow(new Date(rule.lastSeenAt), { addSuffix: true })}
          </span>
          {rule.reviewedAt && (
            <span>
              Reviewed {formatDistanceToNow(new Date(rule.reviewedAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={mutationPending}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          {rule.status !== "approved" && approval && (
            <Button
              type="button"
              size="sm"
              onClick={() => onSave(rule, approval)}
              disabled={mutationPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isMutating ? <Loader2 className="animate-spin" /> : <Check />}
              Approve
            </Button>
          )}
          {rule.status !== "rejected" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSave(rule, inactiveRule("rejected"))}
              disabled={mutationPending}
              className="border-destructive/20 text-destructive hover:bg-destructive/5"
            >
              {isMutating ? <Loader2 className="animate-spin" /> : <XCircle />}
              Reject
            </Button>
          )}
          {rule.status !== "approved" && !approval && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              Edit to complete approval details
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function formFromRule(rule: PromotionRule): PromotionFormState {
  return {
    status: rule.status,
    discountPercent: rule.discountPercent?.toString() ?? "",
    application: rule.application,
    minimumQuantity: rule.minimumQuantity?.toString() ?? "",
    assumption: rule.assumption ?? "",
  };
}

function requestFromForm(form: PromotionFormState): UpdatePromotionRequest {
  if (form.status !== "approved") return inactiveRule(form.status);

  if (form.application !== "automatic" && form.application !== "conditional") {
    throw new Error("Choose automatic or conditional application for an approved rule.");
  }

  const discountPercent = Number(form.discountPercent);
  if (!form.discountPercent.trim() || !isValidPercent(discountPercent)) {
    throw new Error("Enter a discount percentage greater than 0 and less than 100.");
  }

  if (form.application === "automatic") {
    return {
      status: "approved",
      discountPercent,
      application: "automatic",
      minimumQuantity: null,
      assumption: null,
    };
  }

  const minimumQuantity = Number(form.minimumQuantity);
  if (
    !form.minimumQuantity.trim() ||
    !Number.isInteger(minimumQuantity) ||
    minimumQuantity < 2
  ) {
    throw new Error("Conditional rules require a whole-number minimum quantity of at least 2.");
  }
  if (!form.assumption.trim()) {
    throw new Error("Describe the condition shoppers must satisfy.");
  }

  return {
    status: "approved",
    discountPercent,
    application: "conditional",
    minimumQuantity,
    assumption: form.assumption.trim(),
  };
}

function PromotionEditDialog({
  rule,
  isPending,
  onClose,
  onSave,
}: {
  rule: PromotionRule;
  isPending: boolean;
  onClose: () => void;
  onSave: (rule: PromotionRule, data: UpdatePromotionRequest) => void;
}) {
  const [form, setForm] = useState<PromotionFormState>(() => formFromRule(rule));
  const [validationError, setValidationError] = useState<string | null>(null);
  const approved = form.status === "approved";
  const conditional = approved && form.application === "conditional";

  const updateForm = <K extends keyof PromotionFormState>(
    key: K,
    value: PromotionFormState[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onSave(rule, requestFromForm(form));
    } catch (error) {
      setValidationError(errorMessage(error));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-5 pr-12">
          <DialogTitle className="font-display text-xl">Edit promotion rule</DialogTitle>
          <DialogDescription className="break-words pt-1">
            Raw label: <span className="font-medium text-foreground">{rule.label}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="promotion-status">Review status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => updateForm("status", value as PromotionStatus)}
              >
                <SelectTrigger id="promotion-status" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {!approved && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Pending and rejected rules do not affect prices. Discount fields will be cleared.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="promotion-discount">Discount percentage</Label>
                <div className="relative">
                  <Input
                    id="promotion-discount"
                    type="number"
                    min="0.01"
                    max="99.99"
                    step="any"
                    placeholder="e.g. 20"
                    value={form.discountPercent}
                    onChange={(event) => updateForm("discountPercent", event.target.value)}
                    disabled={!approved}
                    className="h-10 rounded-xl pr-9"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promotion-application">Application</Label>
                <Select
                  value={form.application}
                  onValueChange={(value) => updateForm("application", value as PromotionApplication)}
                  disabled={!approved}
                >
                  <SelectTrigger id="promotion-application" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic">Automatic</SelectItem>
                    <SelectItem value="conditional">Conditional</SelectItem>
                    <SelectItem value="not_applicable">Not applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="promotion-minimum">Minimum quantity</Label>
              <Input
                id="promotion-minimum"
                type="number"
                min="2"
                step="1"
                placeholder="e.g. 2"
                value={form.minimumQuantity}
                onChange={(event) => updateForm("minimumQuantity", event.target.value)}
                disabled={!conditional}
                className="h-10 rounded-xl sm:max-w-56"
              />
              <p className="text-xs text-muted-foreground">
                Required for conditional rules; automatic rules do not use this field.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="promotion-assumption">Assumption</Label>
              <Textarea
                id="promotion-assumption"
                maxLength={500}
                rows={3}
                placeholder="e.g. Discount applies when buying 2 or more items."
                value={form.assumption}
                onChange={(event) => updateForm("assumption", event.target.value)}
                disabled={!conditional}
                className="resize-none rounded-xl"
              />
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>Explain the condition used when calculating effective prices.</span>
                <span className="shrink-0">{form.assumption.length}/500</span>
              </div>
            </div>

            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Check the rule details</AlertTitle>
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-4 sm:space-x-0">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PromotionsPage() {
  const [activeTab, setActiveTab] = useState<PromotionStatus>("pending");
  const [editingRule, setEditingRule] = useState<PromotionRule | null>(null);
  const [mutatingRuleId, setMutatingRuleId] = useState<number | null>(null);
  const { data: promotions = [], isLoading, isError, error, refetch } = useGetPromotions();
  const updateMutation = useUpdatePromotion();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateAffectedQueries = (rule: PromotionRule) => {
    queryClient.invalidateQueries({ queryKey: getGetPromotionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCategoryOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTriggeredAlertsQueryKey() });
    rule.affectedProducts.forEach((product) => {
      queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(product.id) });
    });
  };

  const saveRule = (rule: PromotionRule, data: UpdatePromotionRequest) => {
    setMutatingRuleId(rule.id);
    updateMutation.mutate(
      { id: rule.id, data },
      {
        onSuccess: () => {
          invalidateAffectedQueries(rule);
          setEditingRule(null);
          toast({
            title:
              data.status === "approved"
                ? "Promotion approved"
                : data.status === "rejected"
                  ? "Promotion rejected"
                  : "Promotion moved to pending",
            description: `“${rule.label}” has been updated.`,
          });
        },
        onError: (mutationError) => {
          toast({
            title: "Failed to update promotion",
            description: errorMessage(mutationError),
            variant: "destructive",
          });
        },
        onSettled: () => setMutatingRuleId(null),
      }
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-foreground">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BadgePercent className="h-6 w-6" />
            </span>
            Promotions
          </h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
            Review scraped promotion labels before their discounts are used in price comparisons.
            Suggestions are starting points; your reviewed values take precedence.
          </p>
        </div>
        {!isLoading && !isError && promotions.some((rule) => rule.status === "pending") && (
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
            <Clock3 className="h-4 w-4" />
            {promotions.filter((rule) => rule.status === "pending").length} awaiting review
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading promotion rules…</p>
        </div>
      ) : isError ? (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Couldn’t load promotions</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{errorMessage(error)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PromotionStatus)}>
          <TabsList className="grid h-12 w-full max-w-xl grid-cols-3 rounded-xl p-1.5">
            {STATUSES.map((status) => {
              const count = promotions.filter((rule) => rule.status === status).length;
              return (
                <TabsTrigger
                  key={status}
                  value={status}
                  className="gap-2 rounded-lg data-[state=active]:bg-background"
                >
                  {STATUS_LABELS[status]}
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-bold text-muted-foreground shadow-sm">
                    {count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {STATUSES.map((status) => {
            const rules = promotions.filter((rule) => rule.status === status);
            return (
              <TabsContent key={status} value={status} className="mt-6">
                {rules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card px-6 py-20 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                      <Tag className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">
                      No {STATUS_LABELS[status].toLowerCase()} promotions
                    </h2>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {EMPTY_MESSAGES[status]}
                    </p>
                  </div>
                ) : (
                  <div className="grid items-start gap-5 xl:grid-cols-2">
                    {rules.map((rule) => (
                      <PromotionCard
                        key={rule.id}
                        rule={rule}
                        isMutating={updateMutation.isPending && mutatingRuleId === rule.id}
                        mutationPending={updateMutation.isPending}
                        onEdit={() => setEditingRule(rule)}
                        onSave={saveRule}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {editingRule && (
        <PromotionEditDialog
          key={editingRule.id}
          rule={editingRule}
          isPending={updateMutation.isPending}
          onClose={() => setEditingRule(null)}
          onSave={saveRule}
        />
      )}
    </div>
  );
}
