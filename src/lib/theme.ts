/**
 * Light, Dark, or Automatic (follow the phone). The choice lives in a cookie
 * so the server can paint the right colours on the first frame; it is set on
 * <html data-theme> and read by the colour tokens in globals.css.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_COOKIE = "poold-theme";

/**
 * Night mode ships with iPhone build 2, which keeps the status bar readable
 * over it. Until then it is on for the test site (and local dev) only; the
 * live site stays light and hides the Appearance choice. Release 1.1: delete
 * this and the checks that read it (docs/NEXT-RELEASE.md).
 */
export const APPEARANCE_READY =
  process.env.NEXT_PUBLIC_TD_POOL_ENV === "staging" || process.env.NODE_ENV === "development";

export function parseTheme(value: string | undefined | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
