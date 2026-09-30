/**
 * What the iPhone app's share extension handed over: the slip picture and the
 * shared text (usually the bet's link). Taking it clears it. null in a browser
 * or when nothing is waiting. Native side: ios/App/App/PooldShareInboxPlugin.swift.
 */
export type SharedTicket = { image: Blob | null; text: string };

type InboxPlugin = { take(): Promise<{ image?: string | null; text?: string | null }> };
let plugin: InboxPlugin | null = null;

/**
 * Taking clears the inbox, so a caller that arrives while a take is still in
 * flight (React runs effects twice in development) shares its answer. Once it
 * settles the slot empties: the app keeps one page alive across screens, and
 * a remembered answer would hand the last shared bet to the next "Post a
 * ticket".
 */
let taking: Promise<SharedTicket | null> | null = null;

export function takeSharedTicket(): Promise<SharedTicket | null> {
  taking ??= take().finally(() => {
    taking = null;
  });
  return taking;
}

async function take(): Promise<SharedTicket | null> {
  if (typeof window === "undefined" || !("Capacitor" in window)) return null;
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("PooldShareInbox")) return null;
  plugin ??= registerPlugin<InboxPlugin>("PooldShareInbox");
  const result = await plugin.take();
  const text = (result.text ?? "").trim();
  const image = result.image?.startsWith("data:image/") ? await (await fetch(result.image)).blob() : null;
  if (!image && !text) return null;
  return { image, text };
}
