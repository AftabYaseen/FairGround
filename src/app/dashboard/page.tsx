import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { requireProvider } from "@/lib/provider-session";

// Overview is completed in Phase 5 (cap bar, new requests).
export default async function DashboardPage() {
  const { provider } = await requireProvider("/dashboard");
  return (
    <PageHeader
      title={provider.business_name}
      description="Your profile is live."
      actions={<LinkButton href="/dashboard/link">Share your link</LinkButton>}
    />
  );
}
