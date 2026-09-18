import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { BottomNav } from "@/components/layout/bottom-nav";
import type { BottomNavItem } from "@/components/layout/nav-items";

export type AppShellProps = {
  children: ReactNode;
  header?: ReactNode;
  basePath: string;
  navItems?: BottomNavItem[];
  /** A ready-made bar (the league's per-section nav) instead of `navItems`. */
  nav?: ReactNode;
  hideNav?: boolean;
  className?: string;
};

export function AppShell({
  children,
  header,
  basePath,
  navItems,
  nav,
  hideNav = false,
  className,
}: AppShellProps) {
  return (
    <div className={cn("relative mx-auto flex min-h-dvh w-full max-w-lg flex-col", className)}>
      {header ? (
        <header className="sticky top-[var(--banner-h,0px)] z-30 border-b border-border/80 bg-field/90 px-4 pb-3 pt-[max(0.75rem,var(--top-inset,env(safe-area-inset-top)))] backdrop-blur-md">
          {header}
        </header>
      ) : null}

      <main
        className={cn(
          "flex-1 px-4 py-4",
          !hideNav && "pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </main>

      {hideNav ? null : nav ? (
        nav
      ) : navItems ? (
        <BottomNav basePath={basePath} items={navItems} />
      ) : null}
    </div>
  );
}
