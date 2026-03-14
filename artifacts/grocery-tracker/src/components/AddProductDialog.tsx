import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Link as LinkIcon, Plus, X, Loader2, PackageSearch,
  Layers, ChevronRight, CheckCircle2, Ruler,
} from "lucide-react";
import {
  useSearchHKTVMall, useTrackProduct, useUpdateProductUnit,
  useGetProductTypes, getGetProductsQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn, formatHKD } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "find" | "configure";

export function AddProductDialog({ isOpen, onClose }: AddProductDialogProps) {
  const [tab, setTab] = useState<"search" | "url">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [step, setStep] = useState<Step>("find");
  const [justAdded, setJustAdded] = useState<Product | null>(null);

  // Step 2 fields
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [packageQuantity, setPackageQuantity] = useState("");
  const [packageUnit, setPackageUnit] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: searchResults, isLoading: isSearching, refetch: performSearch, isFetching } =
    useSearchHKTVMall({ q: searchQuery }, { query: { enabled: false } });

  const { data: productTypes = [] } = useGetProductTypes();
  const trackMutation = useTrackProduct();
  const updateUnitMutation = useUpdateProductUnit();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) performSearch();
  };

  const afterTrack = (product: Product) => {
    queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
    setJustAdded(product);
    setStep("configure");
    setSelectedTypeId(null);
    setPackageQuantity("");
    setPackageUnit("");
  };

  const handleAddByUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    trackMutation.mutate(
      { data: { productUrl: urlInput } },
      {
        onSuccess: (product) => {
          afterTrack(product);
          setUrlInput("");
        },
        onError: () => {
          toast({ title: "Failed to add", description: "Please check the URL and try again.", variant: "destructive" });
        },
      }
    );
  };

  const handleAddSearchResult = (url: string) => {
    trackMutation.mutate(
      { data: { productUrl: url } },
      {
        onSuccess: (product) => afterTrack(product),
      }
    );
  };

  const handleSaveUnit = () => {
    if (!justAdded) return;
    const qty = parseFloat(packageQuantity);
    updateUnitMutation.mutate(
      {
        id: justAdded.id,
        data: {
          productTypeId: selectedTypeId ?? null,
          packageQuantity: !isNaN(qty) && qty > 0 ? qty : null,
          packageUnit: packageUnit.trim() || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          toast({ title: "Product added!", description: "Unit pricing configured." });
          handleClose();
        },
      }
    );
  };

  const handleSkipUnit = () => {
    toast({ title: "Product added!", description: "Now tracking price changes." });
    handleClose();
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("find");
      setJustAdded(null);
      setSearchQuery("");
      setUrlInput("");
    }, 300);
  };

  const selectedType = productTypes.find((t) => t.id === selectedTypeId) ?? null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h2 className="text-xl font-display font-bold text-foreground">
              {step === "find" ? "Add to Watchlist" : "Unit Pricing (Optional)"}
            </h2>
            {step === "configure" && (
              <p className="text-xs text-muted-foreground mt-0.5">Configure for price-per-unit comparison</p>
            )}
          </div>
          <button onClick={handleClose} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Find product */}
        {step === "find" && (
          <>
            <div className="flex p-2 bg-muted/30 mx-6 mt-6 rounded-xl border border-border/50">
              <button
                onClick={() => setTab("search")}
                className={cn("flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200", tab === "search" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Search className="w-4 h-4" /> Search HKTVMall
              </button>
              <button
                onClick={() => setTab("url")}
                className={cn("flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200", tab === "url" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <LinkIcon className="w-4 h-4" /> Paste URL
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
              {tab === "url" ? (
                <form onSubmit={handleAddByUrl} className="space-y-6 flex flex-col h-full justify-center pb-12">
                  <div className="text-center space-y-2 mb-4">
                    <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                      <LinkIcon className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold">Track by Product URL</h3>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                      Paste the full web address of a product from HKTVMall to start tracking its price instantly.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="url"
                      placeholder="https://www.hktvmall.com/hktv/zh/p/..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full px-4 py-3 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                      required
                    />
                    <button
                      type="submit"
                      disabled={trackMutation.isPending || !urlInput}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50 disabled:transform-none disabled:hover:shadow-lg transition-all"
                    >
                      {trackMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                      {trackMutation.isPending ? "Adding..." : "Add to Watchlist"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col h-full space-y-6">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search snacks, drinks, essentials..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isFetching || !searchQuery}
                      className="px-6 py-3 bg-secondary text-secondary-foreground rounded-xl font-bold hover:bg-secondary/80 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {isFetching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search"}
                    </button>
                  </form>

                  <div className="flex-1 overflow-y-auto -mx-2 px-2">
                    {isFetching && (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                        <p>Searching HKTVMall...</p>
                      </div>
                    )}

                    {!isFetching && searchResults?.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
                        <PackageSearch className="w-12 h-12 mb-4 opacity-20" />
                        <p className="font-medium text-foreground">No results found</p>
                        <p className="text-sm">Try a different keyword or use the URL tab.</p>
                      </div>
                    )}

                    <div className="space-y-3">
                      {searchResults?.map((result, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                          <div className="w-16 h-16 rounded-lg bg-white border border-border flex items-center justify-center overflow-hidden shrink-0">
                            {result.imageUrl ? (
                              <img src={result.imageUrl} alt={result.name} className="w-full h-full object-contain" />
                            ) : (
                              <PackageSearch className="w-6 h-6 text-muted-foreground/30" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-foreground truncate">{result.name}</h4>
                            {result.nameZh && <p className="text-xs text-muted-foreground truncate">{result.nameZh}</p>}
                            <div className="mt-1 font-bold text-primary">{formatHKD(result.currentPrice)}</div>
                          </div>
                          <button
                            onClick={() => handleAddSearchResult(result.productUrl)}
                            disabled={result.isTracked || trackMutation.isPending}
                            className={cn(
                              "shrink-0 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 transition-all",
                              result.isTracked
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                            )}
                          >
                            {result.isTracked ? "Tracked" : <><Plus className="w-4 h-4" /> Add</>}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 2: Configure unit pricing */}
        {step === "configure" && justAdded && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Added product preview */}
            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{justAdded.name}</p>
                <p className="text-xs text-muted-foreground">{formatHKD(justAdded.currentPrice)} · Added to watchlist</p>
              </div>
            </div>

            {/* Product Type */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-muted-foreground" />
                Product Category
              </label>
              <p className="text-xs text-muted-foreground">Group similar products for unit-price comparison (e.g. mouthwash, shampoo).</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {productTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      if (selectedTypeId === type.id) {
                        setSelectedTypeId(null);
                        setPackageUnit("");
                      } else {
                        setSelectedTypeId(type.id);
                        setPackageUnit(type.unitLabel);
                      }
                    }}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm font-medium border transition-all text-left",
                      selectedTypeId === type.id
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-background border-border text-foreground hover:border-primary/30"
                    )}
                  >
                    <div className="font-semibold truncate">{type.name}</div>
                    <div className="text-xs text-muted-foreground">per {type.unitLabel}</div>
                  </button>
                ))}
                {productTypes.length === 0 && (
                  <p className="col-span-full text-xs text-muted-foreground italic">
                    No categories yet. Create some in the Product Types settings.
                  </p>
                )}
              </div>
            </div>

            {/* Package size */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-muted-foreground" />
                Package Size
              </label>
              <p className="text-xs text-muted-foreground">Used to calculate the unit price (e.g. price per ml).</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 500"
                  value={packageQuantity}
                  onChange={(e) => setPackageQuantity(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground text-sm"
                />
                <input
                  type="text"
                  placeholder={selectedType?.unitLabel ?? "ml / g / tablet"}
                  value={packageUnit}
                  onChange={(e) => setPackageUnit(e.target.value)}
                  className="w-32 px-4 py-2.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground text-sm"
                />
              </div>
              {packageQuantity && parseFloat(packageQuantity) > 0 && (
                <p className="text-xs text-emerald-600 font-medium">
                  Unit price: {formatHKD(justAdded.currentPrice / parseFloat(packageQuantity))}/{packageUnit || (selectedType?.unitLabel ?? "unit")}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSkipUnit}
                className="flex-1 py-2.5 bg-muted text-muted-foreground rounded-xl font-semibold hover:bg-muted/70 transition-colors text-sm"
              >
                Skip for Now
              </button>
              <button
                onClick={handleSaveUnit}
                disabled={updateUnitMutation.isPending}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none transition-all text-sm"
              >
                {updateUnitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {updateUnitMutation.isPending ? "Saving..." : "Save & Done"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
