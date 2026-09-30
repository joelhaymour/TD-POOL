import Link from "next/link";
import { Plus } from "lucide-react";
import { getStore } from "@/lib/store";
import { accountDisplayName, requireUser } from "@/lib/auth/session";
import { enabledSections, withoutSections } from "@/lib/league/sections";
import { hiddenSections } from "@/lib/native/server";
import { Wordmark } from "@/components/brand/logo";
import { NotificationBell } from "@/components/notify/bell";
import { AccountMenu } from "./account-menu";
import { Onboarding } from "@/components/onboarding/onboarding";
import { HomeClient } from "./home-client";
import { LeagueList } from "./league-list";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const accountName = accountDisplayName(user);

  // Set when someone opens an invite link for a league they have not joined.
  const { join, pin } = await searchParams;
  const pendingJoinSlug = typeof join === "string" ? join : "";
  const pendingJoinPin = typeof pin === "string" && /^\d{4,8}$/.test(pin) ? pin : "";

  const hidden = await hiddenSections();
  const leagues = (
    await getStore()
      .listLeaguesForUser(user.id)
      .catch(() => [])
  ).map(({ league, member }) => {
    const visible = withoutSections(league, hidden);
    return {
      id: league.id,
      slug: league.slug,
      name: league.name,
      sections: enabledSections(visible).map((s) => s.label).join(" · ") || "Open on the website",
      memberCount: league.member_count,
      isAdmin: member.role === "admin",
      pinnedAt: member.pinned_at ?? null,
    };
  });

  return (
    <div className="field-atmosphere min-h-dvh">
      <main className="animate-page-in mx-auto w-full max-w-lg px-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
        <header className="flex items-center justify-between gap-3">
          <Wordmark className="text-4xl text-ink" />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <AccountMenu name={accountName} email={user.email ?? ""} />
          </div>
        </header>

        {leagues.some((l) => l.sections.includes("Tickets")) ? (
          <Link
            href="/share"
            className="pressable mt-5 flex h-[3.25rem] items-center justify-center gap-2 rounded-full bg-lime text-[15px] font-semibold text-accent-fg shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(17,128,60,0.6)]"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden /> Post a ticket
          </Link>
        ) : null}

        {leagues.length > 0 ? (
          <LeagueList leagues={leagues} />
        ) : (
          <section className="mt-10">
            <h1 className="text-3xl font-bold leading-tight text-ink tracking-tight">
              Welcome, {accountName.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-sm text-base leading-relaxed text-ink-muted">
              One TD pick each week, and every bet your group places, followed
              live. Start a league or join one with a code.
            </p>
          </section>
        )}

        <HomeClient
          accountName={accountName}
          hasLeagues={leagues.length > 0}
          pendingJoinSlug={pendingJoinSlug}
          pendingJoinPin={pendingJoinSlug ? pendingJoinPin : ""}
          hiddenSections={hidden}
        />
        {/* First open on this device: the tour, then the notifications ask.
            An invite's join sheet waits underneath for when it's done. */}
        <Onboarding />
      </main>
    </div>
  );
}
