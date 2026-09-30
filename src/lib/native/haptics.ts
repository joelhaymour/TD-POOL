/**
 * The small clicks the iPhone gives under your finger. Silent in a browser and
 * on any build without the Haptics plugin; never throws.
 */
type HapticsPlugin = {
  selectionStart(): Promise<void>;
  selectionChanged(): Promise<void>;
  selectionEnd(): Promise<void>;
  impact(options: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
};

let plugin: Promise<HapticsPlugin | null> | null = null;

function haptics(): Promise<HapticsPlugin | null> {
  plugin ??= (async () => {
    if (typeof window === "undefined" || !("Capacitor" in window)) return null;
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Haptics")) return null;
    return registerPlugin<HapticsPlugin>("Haptics");
  })().catch(() => null);
  return plugin;
}

function run(call: (h: HapticsPlugin) => Promise<void>) {
  void haptics()
    .then((h) => (h ? call(h) : undefined))
    .catch(() => undefined);
}

/** A light tap: a button that did something. */
export function tap() {
  run((h) => h.impact({ style: "LIGHT" }));
}

/** The tick as a finger slides from one option to the next. */
export function tick() {
  run(async (h) => {
    await h.selectionStart();
    await h.selectionChanged();
    await h.selectionEnd();
  });
}
