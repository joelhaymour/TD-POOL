/**
 * Keeps the iPhone status bar readable: light text over the dark theme,
 * dark text over the light one. Silent in a browser, and in app builds
 * without the StatusBar plugin (build 1).
 */
type StatusBarPlugin = { setStyle(options: { style: "DARK" | "LIGHT" }): Promise<void> };

let plugin: Promise<StatusBarPlugin | null> | null = null;

function statusBar(): Promise<StatusBarPlugin | null> {
  plugin ??= (async () => {
    if (typeof window === "undefined" || !("Capacitor" in window)) return null;
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("StatusBar")) return null;
    return registerPlugin<StatusBarPlugin>("StatusBar");
  })().catch(() => null);
  return plugin;
}

/** True when the page is showing its dark colours right now. */
export function showingDark(): boolean {
  const choice = document.documentElement.dataset.theme;
  if (choice === "dark") return true;
  if (choice === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function syncStatusBar() {
  // Capacitor's "DARK" style means light text, for dark backgrounds.
  void statusBar()
    .then((bar) => bar?.setStyle({ style: showingDark() ? "DARK" : "LIGHT" }))
    .catch(() => undefined);
}
