import { Badge } from "@/components/ui/badge";

export function AvailabilityBadge({ paused }: { paused: boolean }) {
  return paused ? <Badge tone="neutral">Not accepting requests right now</Badge> : <Badge tone="success">Accepting requests</Badge>;
}
