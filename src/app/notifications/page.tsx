import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = { title: "Notifications · Pool’d" };

export default async function NotificationsPage() {
  await requireUser("/notifications");
  return <NotificationsClient />;
}
