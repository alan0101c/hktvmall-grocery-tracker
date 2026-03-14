import { Link, useLocation } from "wouter";
import { Leaf, Bell, Package2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Watchlist", icon: Package2 },
    { href: "/alerts", label: "Alerts", icon: Bell },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border shadow-sm shadow-primary/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/20">
            <Leaf className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
          <span className="font-display font-bold text-xl text-foreground tracking-tight">
            PriceWatch<span className="text-primary">.</span>
          </span>
        </div>

        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((link) => {
            const isActive = location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <link.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
