import { Container, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";

// Placeholder until Phase 5 (admin area).
export default async function AdminPage() {
  await requireRole("admin", "/admin");
  return (
    <Container className="py-12">
      <PageHeader title="Admin" description="The admin area arrives in Phase 5." />
    </Container>
  );
}
