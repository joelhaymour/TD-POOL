/**
 * Light, Dark, or Automatic (follow the phone). The choice lives in a cookie
 * so the server can paint the right colours on the first frame; it is set on
 * <html data-theme> and read by the colour tokens in globals.css.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_COOKIE = "poold-theme";

export function parseTheme(value: string | undefined | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
