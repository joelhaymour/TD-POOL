import Link from "next/link";

/** Dark, safe-area-aware 404 — the native shell has no browser chrome to fall back on. */
export default function NotFound() {
  return (
    <div className="field-atmosphere min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-semibold text-ink-faint">Pool’d</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-wide text-ink">
          Nothing here
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
          That page doesn&apos;t exist, or the league it belonged to is gone.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 w-fit items-center rounded-full bg-lime px-5 pressable text-[15px] font-semibold text-accent-fg shadow-[0_6px_16px_-6px_rgba(17,128,60,0.55)]"
        >
          Back to your leagues
        </Link>
      </main>
    </div>
  );
}
