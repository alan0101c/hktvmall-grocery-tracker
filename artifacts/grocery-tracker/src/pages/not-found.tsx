import { Link } from "wouter";
import { PackageSearch } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="bg-primary/10 w-24 h-24 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
        <PackageSearch className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-4xl font-display font-bold text-foreground mb-2 tracking-tight">Aisle Not Found</h1>
      <p className="text-muted-foreground max-w-sm text-center mb-8 text-lg">
        We couldn't find the page you're looking for. It might have been moved or removed.
      </p>
      <Link href="/" className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:-translate-y-0.5 hover:shadow-xl shadow-primary/25 transition-all">
        Back to Watchlist
      </Link>
    </div>
  );
}
