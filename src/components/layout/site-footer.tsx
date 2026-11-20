import Link from "next/link";
import { cookies } from "next/headers";
import { Container } from "@/components/ui/misc";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { Logo } from "./logo";

export async function SiteFooter() {
  const cookieStore = await cookies();
  const linkLocked = Boolean(cookieStore.get(LINK_LOCK_COOKIE)?.value);

  const columns: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: "FairGround",
      links: [
        ...(linkLocked ? [] : [{ href: "/providers", label: "Find a provider" }]),
        { href: "/beta", label: "Founding members" },
        { href: "/faq", label: "FAQ" },
        { href: "/contact", label: "Contact" },
      ],
    },
    {
      title: "For providers",
      links: [
        { href: "/signup?role=provider", label: "Join as a provider" },
        { href: "/login", label: "Provider login" },
        { href: "/beta", label: "Pricing" },
      ],
    },
    {
      title: "Policies",
      links: [
        { href: "/fairness-policy", label: "Fairness policy" },
        { href: "/terms", label: "Terms" },
        { href: "/privacy", label: "Privacy" },
      ],
    },
  ];

  return (
    <footer className="mt-auto bg-charcoal text-plaster">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo inverse />
          <p className="max-w-xs text-sm text-plaster/80">
            One request. One provider. No bidding wars, no shared leads, no surprise fees.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="font-body text-sm font-semibold uppercase tracking-wider text-safety">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-plaster/90 hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-charcoal-2">
        <Container className="flex flex-col gap-2 py-5 text-xs text-plaster/70 sm:flex-row sm:items-center sm:justify-between">
          <p>A FairGround resource from OPAL Quality Systems Management</p>
          <p>Built with respect for service providers.</p>
        </Container>
      </div>
    </footer>
  );
}
