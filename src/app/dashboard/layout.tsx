import { SideNav } from "@/components/layout/side-nav";
import { Container } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { getOwnProvider } from "@/lib/providers";

const NAV = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/requests", label: "Requests" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/link", label: "Request link" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/billing", label: "Billing" },
];

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await getSession();
  const provider = session?.profile?.role === "provider" ? await getOwnProvider(session.userId) : null;
  const onboarded = Boolean(provider?.onboarded_at);

  if (!onboarded) {
    return <Container className="py-10 sm:py-14">{children}</Container>;
  }

  return (
    <Container className="grid gap-8 py-8 sm:py-10 lg:grid-cols-[200px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 hidden truncate font-heading text-lg font-bold lg:block">{provider?.business_name}</p>
        <SideNav items={NAV} label="Dashboard" />
      </aside>
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
