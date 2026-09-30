"use client";

import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { syncStatusBar } from "@/lib/native/status-bar";
import { parseTheme, THEME_COOKIE, type ThemeChoice } from "@/lib/theme";

function applyTheme(choice: ThemeChoice) {
  document.documentElement.dataset.theme = choice;
  try {
    document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // No cookie: the choice lasts for this visit.
  }
  syncStatusBar();
}

/** Automatic · Light · Dark, in the account sheet. Takes effect at once. */
export function AppearancePicker() {
  // Only ever rendered inside an open sheet, so the document is there.
  const [choice, setChoice] = useState<ThemeChoice>(() =>
    parseTheme(document.documentElement.dataset.theme),
  );
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-muted">Appearance</p>
      <Segmented
        label="Appearance"
        value={choice}
        onChange={(next) => {
          setChoice(next);
          applyTheme(next);
        }}
        options={[
          { value: "system", label: "Automatic" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  );
}

/**
 * Keeps the status bar in step when the phone flips between light and dark
 * (for Automatic) and on each page load.
 */
export function ThemeSync() {
  useEffect(() => {
    syncStatusBar();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncStatusBar);
    return () => media.removeEventListener("change", syncStatusBar);
  }, []);
  return null;
}
