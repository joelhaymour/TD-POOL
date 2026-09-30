"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { signIn, signUp, type AuthState } from "./actions";

const emptyAuthState: AuthState = { error: null, notice: null };

const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-ink/[0.05] px-3 focus:bg-white text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

const labelClass =
  "mb-1.5 block text-[11px] font-semibold text-ink-faint";

type Mode = "signin" | "signup";

function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const [state, formAction, pending] = useActionState(
    mode === "signup" ? signUp : signIn,
    emptyAuthState,
  );

  return (
    <form
      action={formAction}
      className="mt-4 space-y-3 rounded-[1.4rem] bg-white/80 p-4 shadow-card backdrop-blur-xl"
    >
      <input type="hidden" name="next" value={next} />

      {mode === "signup" ? (
        <label className="block">
          <span className={labelClass}>Your name</span>
          <input
            name="displayName"
            className={inputClass}
            placeholder="Joel"
            autoComplete="name"
            required
          />
        </label>
      ) : null}

      <label className="block">
        <span className={labelClass}>Email</span>
        <input
          name="email"
          type="email"
          className={inputClass}
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
      </label>

      <label className="block">
        <span className={labelClass}>Password</span>
        <input
          name="password"
          type="password"
          className={inputClass}
          placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
        />
      </label>

      {state.error ? (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p className="rounded-xl bg-turf/10 px-3 py-2 text-sm font-semibold text-turf">
          {state.notice}
        </p>
      ) : null}

      <Button type="submit" fullWidth disabled={pending}>
        {pending
          ? mode === "signup"
            ? "Creating account…"
            : "Signing in…"
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </Button>
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <>
      <Segmented
        label="Sign in or sign up"
        className="mt-8"
        value={mode}
        onChange={setMode}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Sign up" },
        ]}
      />

      {/* Remounting on mode change clears any error left over from the other tab. */}
      <AuthForm key={mode} mode={mode} next={next} />
    </>
  );
}
