"use client";

import { cn } from "@/lib/utils/cn";

export type BettingMode = "fixed" | "none";

export type MoneySettingsValue = {
  betting_mode: BettingMode;
  fixed_weekly_stake: number;
  currency: "USD" | "CAD";
};

export type MoneySettingsFormProps = {
  value: MoneySettingsValue;
  onChange: (next: MoneySettingsValue) => void;
  className?: string;
  disabled?: boolean;
};

const modes: { id: BettingMode; title: string; hint: string }[] = [
  {
    id: "fixed",
    title: "Fixed stake",
    hint: "One stake on the league parlay each week",
  },
  {
    id: "none",
    title: "No Money",
    hint: "Hide stakes and payout estimates",
  },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-ink/[0.05] px-3 focus:bg-chalk text-sm font-semibold text-ink outline-none transition focus:border-turf focus:ring-2 focus:ring-turf/20";

export function MoneySettingsForm({
  value,
  onChange,
  className,
  disabled,
}: MoneySettingsFormProps) {
  const weeklyStake = value.betting_mode === "fixed" ? value.fixed_weekly_stake : 0;

  return (
    <div className={cn("space-y-5", className)}>
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="mb-2 text-[17px] font-semibold text-ink">
          Betting mode
        </legend>
        {modes.map((mode) => {
          const selected = value.betting_mode === mode.id;
          return (
            <label
              key={mode.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition",
                selected
                  ? "border-ink bg-chalk shadow-card"
                  : "border-border bg-chalk hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name="betting_mode"
                className="mt-1 accent-turf"
                checked={selected}
                onChange={() =>
                  onChange({ ...value, betting_mode: mode.id })
                }
              />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {mode.title}
                </span>
                <span className="block text-xs text-ink-muted">{mode.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {value.betting_mode === "fixed" ? (
        <Field label="Weekly stake ($)">
          <input
            type="number"
            min={0}
            step={1}
            disabled={disabled}
            className={inputClass}
            value={value.fixed_weekly_stake}
            onChange={(e) =>
              onChange({
                ...value,
                fixed_weekly_stake: Number(e.target.value) || 0,
              })
            }
          />
        </Field>
      ) : null}

      {value.betting_mode !== "none" ? (
        <div className="rounded-2xl bg-ink/[0.04] px-4 py-3">
          <p className="text-[11px] font-semibold text-ink-faint">
            Weekly stake
          </p>
          <p className="font-display text-3xl font-extrabold text-ink">
            ${weeklyStake.toLocaleString()}
          </p>
        </div>
      ) : null}
    </div>
  );
}
