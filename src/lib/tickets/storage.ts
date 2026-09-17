import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "tickets";
const SIGNED_URL_TTL_S = 60 * 60;

export const TICKET_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** The client scales screenshots down before upload; this is the hard stop. */
export const TICKET_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

function extensionFor(mediaType: string): string {
  return mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
}

/** Store the original screenshot; returns the path the parlay row keeps. */
export async function uploadTicketImage(
  leagueId: string,
  bytes: Buffer,
  mediaType: string,
): Promise<string> {
  const path = `${leagueId}/${randomUUID()}.${extensionFor(mediaType)}`;
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: mediaType, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeTicketImage(path: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(BUCKET).remove([path]);
  if (error) console.error("ticket image remove failed", path, error);
}

/**
 * Short-lived links for the pictures on a page. The bucket is private, so a
 * URL is minted per page load for members only; the page's own polling keeps
 * them fresh.
 */
export async function signTicketImages(
  paths: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_S);
  if (error) {
    console.error("ticket image signing failed", error);
    return out;
  }
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
