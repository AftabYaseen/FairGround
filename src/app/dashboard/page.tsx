import { Container, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";

// Placeholder until Phase 3 (onboarding) and Phase 5 (dashboard).
export default async function DashboardPage() {
  const { profile } = await requireRole("provider", "/dashboard");
  return (
    <Container className="py-12">
      <PageHeader title={`Welcome, ${profile.full_name || "provider"}`} description="Your provider dashboard is being set up." />
    </Container>
  );
}
