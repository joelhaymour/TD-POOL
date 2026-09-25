import Link from "next/link";
import { getStore } from "@/lib/store";
import { accountDisplayName, requireUser } from "@/lib/auth/session";
import { enabledSections, withoutSections } from "@/lib/league/sections";
import { hiddenSections } from "@/lib/native/server";
import { DeleteAccount } from "./delete-account";
import { HomeClient } from "./home-client";
import { signOut } from "./login/actions";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const accountName = accountDisplayName(user);

  // Set when someone opens an invite link for a league they have not joined.
  const { join } = await searchParams;
  const pendingJoinSlug = typeof join === "string" ? join : "";

  const hidden = await hiddenSections();
  const leagues = (
    await getStore()
      .listLeaguesForUser(user.id)
      .catch(() => [])
  ).map(({ league, member }) => ({ league: withoutSections(league, hidden), member }));

  return (
    <div className="field-atmosphere relative min-h-dvh">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 0%, rgba(17,128,60,0.10), transparent 45%), radial-gradient(ellipse at 90% 30%, rgba(17,128,60,0.06), transparent 50%)",
        }}
      />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 pb-[max(3rem,calc(env(safe-area-inset-bottom)+1.5rem))] pt-[max(3rem,calc(env(safe-area-inset-top)+1.5rem))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.svg" alt="" width={56} height={49} className="mb-5 h-12 w-auto" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-turf">
              {accountName}
            </p>
            <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-[0.9] tracking-wide text-ink sm:text-7xl">
              TD POOL
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <form action={signOut}>
              <button
                type="submit"
                className="mt-1 text-xs font-bold uppercase tracking-wider text-ink-faint hover:text-ink"
              >
                Sign out
              </button>
            </form>
            <DeleteAccount email={user.email ?? "your account"} />
          </div>
        </div>

        {leagues.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
              Your leagues
            </h2>
            <ul className="space-y-2">
              {leagues.map(({ league, member }) => (
                <li key={league.id}>
                  <Link
                    href={`/${league.slug}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm transition hover:border-turf"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-display text-base font-bold uppercase tracking-wide text-ink">
                        {league.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {member.display_name}
                        {member.role === "admin" ? " · admin" : ""} ·{" "}
                        {league.member_count}{" "}
                        {league.member_count === 1 ? "member" : "members"}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-turf">
                        {enabledSections(league)
                          .map((s) => s.label)
                          .join(" · ") || "Open on the website"}
                      </span>
                    </span>
                    <span aria-hidden className="text-lg text-ink-faint">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-6 max-w-sm text-base leading-relaxed text-ink-muted">
            {hidden.length > 0
              ? "One pick each week. Post the bets you placed and follow your friends'. Start a league or join one with a code."
              : "One pick each week. Shared parlays off the board. Post the bets you placed and ride your friends'. Start a league or join one with a code."}
          </p>
        )}

        <HomeClient
          accountName={accountName}
          hasLeagues={leagues.length > 0}
          pendingJoinSlug={pendingJoinSlug}
          hiddenSections={hidden}
        />
      </main>
    </div>
  );
}
