/**
 * Scheduled jobs (Vercel Cron, cron-job.org) call with
 * `Authorization: Bearer $CRON_SECRET`. A deployed site with no secret set
 * refuses every caller rather than running the job for anyone; only local
 * `next dev` runs them without one.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
