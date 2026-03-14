import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Link as LinkIcon, Plus, X, Loader2, PackageSearch } from "lucide-react";
import { useSearchHKTVMall, useTrackProduct, getGetProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn, formatHKD } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddProductDialog({ isOpen, onClose }: AddProductDialogProps) {
  const [tab, setTab] = useState<"search" | "url">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: searchResults, isLoading: isSearching, refetch: performSearch, isFetching } = useSearchHKTVMall(
    { q: searchQuery },
    { query: { enabled: false } }
  );

  const trackMutation = useTrackProduct();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) performSearch();
  };

  const handleAddByUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    
    trackMutation.mutate(
      { data: { productUrl: urlInput } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          toast({ title: "Product added!", description: "Now tracking price changes." });
          onClose();
          setUrlInput("");
        },
        onError: () => {
          toast({ title: "Failed to add", description: "Please check the URL and try again.", variant: "destructive" });
        }
      }
    );
  };

  const handleAddSearchResult = (url: string) => {
    trackMutation.mutate(
      { data: { productUrl: url } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          toast({ title: "Product added!", description: "Now tracking price changes." });
          onClose();
        },
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="text-xl font-display font-bold text-foreground">Add to Watchlist</h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

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
                {isFetching && searchResults?.length === 0 && (
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
                        {result.isTracked ? "Tracked" : <><Plus className="w-4 h-4"/> Add</>}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
