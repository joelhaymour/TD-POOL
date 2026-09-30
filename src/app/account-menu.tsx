"use client";

import Link from "next/link";
import { useState } from "react";
import { LogOut, Shield } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { MemberChip } from "@/components/ui/result-mark";
import { DeleteAccount } from "./delete-account";
import { signOut } from "./login/actions";

/** The round button in the home header: who you are, sign out, delete. */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Your account"
        onClick={() => setOpen(true)}
        className="pressable rounded-full"
      >
        <MemberChip name={name} className="h-10 w-10 bg-white/80 text-xs text-ink shadow-[var(--glass-shadow)] backdrop-blur-xl" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={name} description={email}>
        <div className="space-y-2 pb-2">
          <Link
            href="/privacy"
            className="flex h-12 items-center gap-3 rounded-xl border border-border bg-chalk px-4 text-sm font-semibold text-ink"
          >
            <Shield className="h-4 w-4 text-ink-muted" aria-hidden /> Privacy
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-chalk px-4 text-left text-sm font-semibold text-ink"
            >
              <LogOut className="h-4 w-4 text-ink-muted" aria-hidden /> Sign out
            </button>
          </form>
          <div className="pt-4 text-center">
            <DeleteAccount email={email} />
          </div>
        </div>
      </Sheet>
    </>
  );
}
