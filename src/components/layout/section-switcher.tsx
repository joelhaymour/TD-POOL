"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { sectionCookieName } from "@/lib/league/sections";

export type SwitcherSection = { path: string; label: string };

/** Kept outside the component: a cookie write is a side effect, not render state. */
function rememberSection(slug: string, path: string) {
  try {
    document.cookie = `${sectionCookieName(slug)}=${path}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // A blocked cookie just means /<slug> opens the first section.
  }
}

/**
 * The pills under the league name: TD Pool · Group Bets · Tickets. Only the
 * sections the league has on are listed, and it is hidden entirely for a
 * league running one thing. The last choice is remembered so `/<slug>` lands
 * where the member left off.
 */
export function SectionSwitcher({
  slug,
  sections,
}: {
  slug: string;
  sections: SwitcherSection[];
}) {
  const pathname = usePathname();
  if (sections.length < 2) return null;
  const current = pathname.split("/")[2];

  function remember(path: string) {
    rememberSection(slug, path);
  }

  return (
    <nav
      aria-label="League sections"
      className="mt-2.5 grid gap-1 rounded-xl border border-border bg-chalk p-1"
      style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
    >
      {sections.map((section) => {
        const active = section.path === current;
        return (
          <Link
            key={section.path}
            href={`/${slug}/${section.path}`}
            onClick={() => remember(section.path)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center justify-center rounded-lg font-display text-xs font-bold uppercase tracking-wider transition",
              active
                ? "bg-lime text-accent-fg shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
