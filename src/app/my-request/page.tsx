import { Container, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";

// Placeholder until Phase 4 (request flow).
export default async function MyRequestPage() {
  const { profile } = await requireRole("client", "/my-request");
  return (
    <Container className="py-12">
      <PageHeader title={`Welcome, ${profile.full_name || "there"}`} description="You do not have an active request." />
    </Container>
  );
}
