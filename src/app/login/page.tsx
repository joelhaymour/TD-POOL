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
            "radial-gradient(ellipse at 20% 0%, rgba(184,242,74,0.28), transparent 45%), radial-gradient(ellipse at 90% 30%, rgba(31,138,76,0.22), transparent 50%)",
        }}
      />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-turf">
          Weekly anytime TD
        </p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-[0.9] tracking-wide text-ink sm:text-7xl">
          TD POOL
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
          Sign in to jump back into your leagues. One account, however many
          group chats you run.
        </p>

        <LoginForm next={returnTo} />
      </main>
    </div>
  );
}
