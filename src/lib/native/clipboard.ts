/**
 * The iOS app (ios/App) registers a tiny native plugin, TDPoolClipboard, that
 * hands back everything on the pasteboard at once: a sportsbook's share puts
 * the slip picture AND the link there, and the web clipboard API inside a
 * WKWebView can only get at them through the small "Paste" bubble people miss.
 *
 * In a browser this resolves to null and the caller uses the web clipboard.
 */
export type NativeClipboard = {
  text: string;
  image: Blob | null;
  /** iOS refused the paste (Don't Allow, or the app's paste setting is Deny). */
  denied: boolean;
};

type TDPoolClipboardPlugin = {
  read(): Promise<{ text?: string | null; image?: string | null; denied?: boolean }>;
};

let plugin: TDPoolClipboardPlugin | null = null;

export async function readNativeClipboard(): Promise<NativeClipboard | null> {
  if (typeof window === "undefined" || !("Capacitor" in window)) return null;
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("TDPoolClipboard")) {
    return null;
  }
  // Registering twice only earns a console warning, but once is enough.
  plugin ??= registerPlugin<TDPoolClipboardPlugin>("TDPoolClipboard");
  const result = await plugin.read();
  const text = (result.text ?? "").trim();
  let image: Blob | null = null;
  if (result.image?.startsWith("data:image/")) {
    image = await (await fetch(result.image)).blob();
  }
  return { text, image, denied: result.denied === true };
}
