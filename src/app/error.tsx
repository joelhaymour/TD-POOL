"use client";

import Link from "next/link";

/** Render error inside the root layout: keeps the dark field and offers a retry. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="field-atmosphere min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-turf">TD Pool</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-wide text-ink">
          Something broke
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
          The page hit an error. Try again, or head back to your leagues.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 items-center rounded-xl bg-lime px-5 font-display text-sm font-extrabold uppercase tracking-wider text-accent-fg transition active:scale-[0.98]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-xl border border-border-strong px-5 font-display text-sm font-extrabold uppercase tracking-wider text-ink transition active:scale-[0.98]"
          >
            Your leagues
          </Link>
        </div>
      </main>
    </div>
  );
}
