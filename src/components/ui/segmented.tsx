"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition, type MouseEvent, type ReactNode } from "react";
import { tap } from "@/lib/native/haptics";
import { cn } from "@/lib/utils/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** A link option (e.g. `?range=season`) instead of a local choice. */
  href?: string;
};

/**
 * The iOS segmented control: a white thumb that slides to the choice the
 * moment it is tapped. Options either call `onChange` or, with `href`, open
 * that address (without jumping to the top).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Read out by screen readers for the group. */
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value);
  const index = options.findIndex((o) => o.value === shown);

  function choose(option: SegmentedOption<T>, e?: MouseEvent<HTMLAnchorElement>) {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return;
    e?.preventDefault();
    if (option.value === value) return;
    tap();
    const href = option.href;
    if (href) {
      startTransition(() => {
        setShown(option.value);
        router.push(href, { scroll: false });
      });
    } else {
      onChange?.(option.value);
    }
  }

  const item = (active: boolean) =>
    cn(
      "relative flex h-8 items-center justify-center rounded-full px-2 text-[13px] font-semibold transition-colors duration-200",
      active ? "text-ink" : "text-ink-muted hover:text-ink",
    );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("relative grid rounded-full bg-ink/[0.06] p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {index >= 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-full bg-thumb shadow-[0_1px_2px_rgba(18,23,15,0.1),0_3px_10px_-3px_rgba(18,23,15,0.2)] transition-transform duration-[420ms] ease-[var(--spring)]"
          style={{
            width: `calc((100% - 6px) / ${options.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      ) : null}
      {options.map((option, i) =>
        option.href ? (
          <Link
            key={option.value}
            href={option.href}
            scroll={false}
            aria-current={option.value === value ? "true" : undefined}
            onClick={(e) => choose(option, e)}
            className={item(i === index)}
          >
            {option.label}
          </Link>
        ) : (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => choose(option)}
            className={item(i === index)}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}
