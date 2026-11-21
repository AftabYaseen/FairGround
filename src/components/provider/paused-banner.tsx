import Link from "next/link";
import { Alert } from "@/components/ui/alert";

const REASON: Record<string, string> = {
  manual: "You paused new requests. Clients see \"Not accepting requests right now\".",
  cap_reached: "You have used all included requests this month, so new requests are paused until the 1st.",
  billing: "New requests are paused because of a billing issue.",
  admin: "FairGround has paused new requests on your account.",
};

export function PausedBanner({ reason }: { reason: string | null }) {
  return (
    <Alert tone="warning" title="You are not receiving new requests">
      {REASON[reason ?? "manual"]}{" "}
      <Link href="/dashboard/settings" className="link">
        Manage in settings
      </Link>
      .
    </Alert>
  );
}
