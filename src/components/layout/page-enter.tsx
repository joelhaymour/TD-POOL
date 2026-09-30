"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Each new screen settles in (a short fade and lift) instead of blinking in.
 * Keyed on the path, so changing the week or a filter on the same screen
 * doesn't replay it.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
