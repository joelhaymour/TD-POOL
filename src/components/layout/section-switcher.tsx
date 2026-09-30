"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition, type MouseEvent } from "react";
import { tap } from "@/lib/native/haptics";
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
 * The segmented control under the league name: TD Pool · Tickets. Only the
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const current = sections.findIndex((s) => s.path === pathname.split("/")[2]);
  // The thumb slides over as soon as you tap, not when the page arrives.
  const [chosen, setChosen] = useOptimistic(current);
  if (sections.length < 2) return null;

  function choose(e: MouseEvent<HTMLAnchorElement>, index: number) {
    const section = sections[index];
    rememberSection(slug, section.path);
    // Let the browser handle new-tab clicks; everything else slides.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (index === current) return;
    tap();
    startTransition(() => {
      setChosen(index);
      router.push(`/${slug}/${section.path}`);
    });
  }

  return (
    <nav
      aria-label="League sections"
      className="relative mt-3 grid rounded-full bg-ink/[0.06] p-[3px]"
      style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
    >
      {chosen >= 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-full bg-white shadow-[0_1px_2px_rgba(18,23,15,0.1),0_3px_10px_-3px_rgba(18,23,15,0.2)] transition-transform duration-[420ms] ease-[var(--spring)]"
          style={{
            width: `calc((100% - 6px) / ${sections.length})`,
            transform: `translateX(${chosen * 100}%)`,
          }}
        />
      ) : null}
      {sections.map((section, index) => {
        const active = index === chosen;
        return (
          <Link
            key={section.path}
            href={`/${slug}/${section.path}`}
            onClick={(e) => choose(e, index)}
            aria-current={index === current ? "page" : undefined}
            className={cn(
              "relative flex h-8 items-center justify-center rounded-full text-[13px] font-semibold transition-colors duration-200",
              active ? "text-ink" : "text-ink-muted",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
