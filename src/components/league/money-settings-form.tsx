"use client";

import { cn } from "@/lib/utils/cn";

export type BettingMode = "individual" | "fixed" | "none";

export type MoneySettingsValue = {
  betting_mode: BettingMode;
  contribution_per_member: number;
  member_count: number;
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
    id: "individual",
    title: "Individual Contribution",
    hint: "Members × contribution = weekly stake",
  },
  {
    id: "fixed",
    title: "Fixed Group Bet",
    hint: "One fixed amount wagered each week",
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
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none transition focus:border-turf focus:ring-2 focus:ring-turf/20";

export function MoneySettingsForm({
  value,
  onChange,
  className,
  disabled,
}: MoneySettingsFormProps) {
  const weeklyStake =
    value.betting_mode === "individual"
      ? value.contribution_per_member * value.member_count
      : value.betting_mode === "fixed"
        ? value.fixed_weekly_stake
        : 0;

  return (
    <div className={cn("space-y-5", className)}>
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
          Betting Mode
        </legend>
        {modes.map((mode) => {
          const selected = value.betting_mode === mode.id;
          return (
            <label
              key={mode.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition",
                selected
                  ? "border-turf bg-turf/8"
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

      {value.betting_mode === "individual" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Per member ($)">
            <input
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              className={inputClass}
              value={value.contribution_per_member}
              onChange={(e) =>
                onChange({
                  ...value,
                  contribution_per_member: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Members">
            <input
              type="number"
              min={1}
              step={1}
              disabled={disabled}
              className={inputClass}
              value={value.member_count}
              onChange={(e) =>
                onChange({
                  ...value,
                  member_count: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
        </div>
      ) : null}

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
        <div className="rounded-xl border border-border bg-field px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
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
