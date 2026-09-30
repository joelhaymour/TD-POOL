"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { PickModeField } from "@/components/league/pick-mode-field";
import { SectionToggles } from "@/components/league/section-toggles";
import { useToast } from "@/components/ui/toast";
import { inviteLink } from "@/lib/league/invite";
import { generateJoinPin, normalizeJoinSlug, pinFromInvite } from "@/lib/league/join";
import { ALL_SECTIONS_ON, withoutSections } from "@/lib/league/sections";
import type { LeagueSection, LeagueSections, PickMode } from "@/lib/types";

type CreatedLeague = {
  slug: string;
  name: string;
  join_pin: string;
};

const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-ink/[0.05] px-3 focus:bg-chalk text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

const labelClass =
  "mb-1.5 block text-[11px] font-semibold text-ink-faint";

export function HomeClient({
  accountName,
  hasLeagues,
  pendingJoinSlug,
  pendingJoinPin = "",
  hiddenSections = [],
}: {
  accountName: string;
  hasLeagues: boolean;
  /** Non-empty when an invite link bounced the user here to join first. */
  pendingJoinSlug: string;
  /** The PIN from the invite link, when the admin's link carried it. */
  pendingJoinPin?: string;
  /** Sections this screen leaves out (group bets in the iOS app). */
  hiddenSections?: LeagueSection[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  // The forms live in a sheet. An invite link opens it on Join, filled in.
  const [sheet, setSheet] = useState<"create" | "join" | null>(
    pendingJoinSlug ? "join" : null,
  );
  const [created, setCreated] = useState<CreatedLeague | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(accountName);
  const [sections, setSections] = useState<LeagueSections>(() =>
    withoutSections({ sections: ALL_SECTIONS_ON }, hiddenSections).sections,
  );
  const [pickMode, setPickMode] = useState<PickMode>("open");
  const [creating, setCreating] = useState(false);

  const [joinSlug, setJoinSlug] = useState(pendingJoinSlug);
  const [joinPin, setJoinPin] = useState(pendingJoinPin);
  // A full invite link (code and PIN) only needs your name and a tap.
  const [invited, setInvited] = useState(Boolean(pendingJoinSlug && pendingJoinPin));
  const [joinName, setJoinName] = useState(accountName);
  const [joining, setJoining] = useState(false);

  const inviteUrl = useMemo(() => {
    if (!created || typeof window === "undefined") return "";
    return inviteLink(window.location.origin, created.slug, created.join_pin);
  }, [created]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !displayName.trim()) {
      toast({
        title: "Missing fields",
        description: "Enter a league name and your display name.",
        tone: "error",
      });
      return;
    }

    const newJoinPin = generateJoinPin();
    setCreating(true);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          admin_display_name: displayName.trim(),
          join_pin: newJoinPin,
          sections,
          pick_mode: sections.group_bets ? pickMode : undefined,
        }),
      });
      const data = (await res.json()) as CreatedLeague & { error?: string };
      if (!res.ok || !data.slug) {
        toast({
          title: "Could not create league",
          description: data.error ?? "Try a different name.",
          tone: "error",
        });
        return;
      }

      setCreated({
        slug: data.slug,
        name: data.name,
        join_pin: data.join_pin || newJoinPin,
      });
      router.refresh();
      toast({ title: "League created", tone: "success" });
    } catch {
      toast({
        title: "Network error",
        description: "Check that the server is running.",
        tone: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    const slug = normalizeJoinSlug(joinSlug);
    if (!slug || !joinPin.trim() || !joinName.trim()) {
      toast({
        title: "Missing fields",
        description: "Enter league code, join PIN, and your display name.",
        tone: "error",
      });
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`/api/leagues/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: joinName.trim(),
          joinPin: joinPin.trim(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        league?: { slug: string };
      };
      if (!res.ok || !data.league?.slug) {
        toast({
          title: "Could not join",
          description: data.error ?? "Check the code and PIN.",
          tone: "error",
        });
        return;
      }

      toast({ title: "You're in", tone: "success" });
      router.push(`/${data.league.slug}`);
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setJoining(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, tone: "success" });
    } catch {
      toast({ title: "Copy failed", description: value, tone: "error" });
    }
  }

  const invite = created ? (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Share the link and join PIN in your group chat. Everyone signs in with
        their own account, so nobody loses their picks.
      </p>
      {(
        [
          ["League link", inviteUrl || `/${created.slug}`],
          ["League code", created.slug],
          ["Join PIN", created.join_pin],
        ] as const
      ).map(([label, value]) => (
        <label key={label} className="block">
          <span className={labelClass}>{label}</span>
          <div className="flex gap-2">
            <input readOnly className={inputClass} value={value} />
            <Button type="button" variant="secondary" onClick={() => void copyText(label, value)}>
              Copy
            </Button>
          </div>
        </label>
      ))}
      <Button type="button" fullWidth onClick={() => router.push(`/${created.slug}`)}>
        Open {created.name}
      </Button>
    </div>
  ) : null;

  const createForm = (
    <form onSubmit={onCreate} className="space-y-3">
      <div>
        <span className={labelClass}>What&apos;s in this league</span>
        <SectionToggles value={sections} onChange={setSections} hidden={hiddenSections} />
      </div>
      {sections.group_bets ? (
        <div>
          <span className={labelClass}>Group bets</span>
          <PickModeField value={pickMode} onChange={setPickMode} />
        </div>
      ) : null}
      <label className="block">
        <span className={labelClass}>League name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunday Crew"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Your display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Joel"
          className={inputClass}
        />
      </label>
      <Button type="submit" fullWidth disabled={creating}>
        {creating ? "Creating…" : "Create league"}
      </Button>
    </form>
  );

  const joinForm = invited ? (
    <form onSubmit={onJoin} className="space-y-4">
      <div className="rounded-2xl bg-ink/[0.04] px-4 py-3.5">
        <p className="text-[13px] text-ink-muted">You’re invited to</p>
        <p className="mt-0.5 truncate font-display text-2xl font-bold text-ink">{joinSlug}</p>
      </div>
      <label className="block">
        <span className={labelClass}>Your name in the league</span>
        <input
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
          placeholder="Alex"
          className={inputClass}
        />
      </label>
      <Button type="submit" size="lg" fullWidth disabled={joining}>
        {joining ? "Joining…" : "Join league"}
      </Button>
      <button
        type="button"
        onClick={() => setInvited(false)}
        className="block w-full text-center text-xs font-medium text-ink-faint"
      >
        Enter a code and PIN instead
      </button>
    </form>
  ) : (
    <form onSubmit={onJoin} className="space-y-3">
      <label className="block">
        <span className={labelClass}>League code</span>
        <input
          value={joinSlug}
          onChange={(e) => {
            setJoinSlug(e.target.value);
            // Pasting the whole invite link fills the PIN too.
            const pin = pinFromInvite(e.target.value);
            if (pin) setJoinPin(pin);
          }}
          placeholder="sunday-crew"
          className={inputClass}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>
      <label className="block">
        <span className={labelClass}>Join PIN</span>
        <input
          value={joinPin}
          onChange={(e) => setJoinPin(e.target.value)}
          placeholder="4-digit PIN"
          inputMode="numeric"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Your display name</span>
        <input
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
          placeholder="Alex"
          className={inputClass}
        />
      </label>
      <Button type="submit" fullWidth disabled={joining}>
        {joining ? "Joining…" : "Join league"}
      </Button>
    </form>
  );

  return (
    <>
      <div className={`${hasLeagues ? "mt-4" : "mt-6"} grid grid-cols-2 gap-2`}>
        <Button type="button" variant={hasLeagues ? "secondary" : "primary"} onClick={() => setSheet("create")}>
          Create league
        </Button>
        <Button type="button" variant="secondary" onClick={() => setSheet("join")}>
          Join with a code
        </Button>
      </div>

      <Sheet
        open={sheet !== null}
        onClose={() => {
          setSheet(null);
          setCreated(null);
        }}
        title={created ? "Invite your league" : sheet === "join" ? "Join a league" : "Create a league"}
      >
        <div className="pb-2">
          {created ? invite : sheet === "join" ? joinForm : createForm}
        </div>
      </Sheet>
    </>
  );
}
