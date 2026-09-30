"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** The bell in the headers: opens the inbox, shows how many are unread. */
export function NotificationBell({ className }: { className?: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications?count=1", { cache: "no-store" });
        if (res.ok && alive) setUnread(((await res.json()) as { unread: number }).unread ?? 0);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className={cn(
        "glass-thick pressable relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted",
        className,
      )}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
