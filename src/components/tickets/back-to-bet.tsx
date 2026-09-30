"use client";

import { useEffect } from "react";
import { parseShareLink, sportsbookName } from "@/lib/props/sportsbooks";
import { rememberPendingShare } from "@/lib/tickets/pending-share";

/**
 * In the app, for a link with no picture: back to the bet with iOS's own
 * "◀ bet365" (an app can't send you back itself), screenshot, share it to
 * Pool'd. Sharing reopens Post a ticket from the home screen, so the link and
 * this league are kept for it meanwhile.
 */
export function BackToBetSteps({ link, slug }: { link: string; slug?: string }) {
  const parsed = parseShareLink(link);
  const url = parsed.ok ? parsed.url : null;
  const book = parsed.ok ? sportsbookName(parsed.sportsbook) : "your sportsbook";
  useEffect(() => {
    if (url) rememberPendingShare(url, slug);
  }, [url, slug]);
  return (
    <div className="rounded-2xl bg-ink/[0.04] px-3.5 py-3 text-[13px] leading-snug text-ink">
      <p className="font-semibold">Your link didn’t include a picture</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 marker:text-ink-muted">
        <li>
          Go back to your bet: tap <span className="font-semibold">◀ {book}</span> in the top-left corner, or swipe
          right along the bottom edge.
        </li>
        <li>Screenshot the bet.</li>
        <li>Tap the screenshot preview, tap Share, and pick Pool’d.</li>
        <li>Pool’d opens with the picture read and this link already filled in. Check it and tap Post.</li>
      </ol>
    </div>
  );
}
