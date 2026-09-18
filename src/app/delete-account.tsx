"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteAccount } from "./login/actions";

/**
 * Apple requires an app that creates accounts to let people delete them from
 * inside the app, so this sits beside Sign out rather than behind an email.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    // On success the action redirects, so only a failure reaches here.
    setBusy(false);
    setError(result?.error ?? "Couldn't delete the account. Try again.");
  }

  return (
    <>
      <button
        type="button"
        className="text-[11px] font-bold uppercase tracking-wider text-ink-faint underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Delete account
      </button>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <ConfirmDialog
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        onConfirm={confirm}
        title="Delete your account?"
        description={`This removes ${email}, your seat in every league, your picks, tickets and screenshots. Leagues where you are the only member are deleted too. There is no undo.`}
        confirmLabel="Delete my account"
        danger
        loading={busy}
      />
    </>
  );
}
