import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · TD Pool",
  description: "What TD Pool stores and why.",
};

const CONTACT = "joelhaymour00@gmail.com";

/**
 * Public (no sign-in) so Apple and Google can link to it from the app
 * listings; the proxy leaves this path alone.
 */
export default function PrivacyPage() {
  return (
    <div className="field-atmosphere min-h-dvh">
      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-[max(3rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-turf">TD Pool</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-wide text-ink">
          Privacy
        </h1>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-ink-muted">
          <section>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              What TD Pool keeps
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Your email address and password, used only to sign you in.</li>
              <li>The display name you choose in each league.</li>
              <li>Your picks, group bets and tickets, and any screenshot of a bet slip you post.</li>
              <li>
                Share links you paste from a sportsbook, so other members of your league can open
                the same bet.
              </li>
            </ul>
          </section>
          <section>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              Who can see it
            </h2>
            <p className="mt-2">
              Only members of the same private league see your picks, tickets and screenshots.
              Nothing is public, nothing is sold, and there are no ads or trackers.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              Bet slip screenshots
            </h2>
            <p className="mt-2">
              When you post a ticket, the screenshot is sent to Anthropic&apos;s Claude API once to
              read the picks off it. It is stored privately for your league and is not used to
              train any model.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              Where it lives
            </h2>
            <p className="mt-2">
              Data is stored with Supabase and the app runs on Vercel. Live game stats come from
              ESPN&apos;s public scoreboard, which is how picks and tickets get graded. TD Pool
              never places a bet and never holds or moves money.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              Deleting your account
            </h2>
            <p className="mt-2">
              Email{" "}
              <a className="font-semibold text-turf underline-offset-2 hover:underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>{" "}
              and your account, picks, tickets and screenshots are removed.
            </p>
          </section>
        </div>
        <Link
          href="/login"
          className="mt-10 inline-block text-xs font-bold uppercase tracking-wider text-ink-faint underline-offset-2 hover:underline"
        >
          Back to TD Pool
        </Link>
      </main>
    </div>
  );
}
