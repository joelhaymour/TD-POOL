import { CardsSkeleton } from "@/components/ui/skeleton";

/** The league header and tab bar stay put; only the screen below them waits. */
export default function Loading() {
  return <CardsSkeleton />;
}
