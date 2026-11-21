import { SideNav } from "@/components/layout/side-nav";
import { Container } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/flags", label: "Abuse flags" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireRole("admin", "/admin");
  return (
    <Container className="grid max-w-7xl gap-8 py-8 sm:py-10 lg:grid-cols-[190px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 hidden text-sm font-semibold uppercase tracking-wider text-muted lg:block">Admin</p>
        <SideNav items={NAV} label="Admin" />
      </aside>
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
