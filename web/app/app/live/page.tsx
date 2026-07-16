import type { Metadata } from "next";
import { LiveView } from "@/components/live/live-view";
import { isHostedOnly } from "@/lib/hosted";

// The live view streams the local store; never prerendered at build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Norn — Live",
  description: "Watch agents read and write memory in real time.",
};

export default function LivePage() {
  // Same guard as the dashboard: a hosted deployment has no local store, so it
  // renders the observatory dark with an explanation.
  return <LiveView hosted={isHostedOnly()} />;
}
