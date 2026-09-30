import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const returnTo = typeof next === "string" && next.startsWith("/") ? next : "/";

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
        <p className="text-[11px] font-semibold text-ink-faint">
          Weekly TD picks · every bet, followed live
        </p>
        <h1 className="mt-3">
          <Wordmark className="text-7xl text-ink" />
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
          Sign in to jump back into your leagues. One account, however many
          group chats you run.
        </p>

        <LoginForm next={returnTo} />
        <Link
          href="/privacy"
          className="mt-6 self-start text-[11px] font-semibold text-ink-faint underline-offset-2 hover:underline"
        >
          Privacy
        </Link>
      </main>
    </div>
  );
}
