import { Menu } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "@/app/actions/auth";
import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { homeForRole } from "@/lib/roles";
import { Logo } from "./logo";

type NavItem = { href: string; label: string };

export async function SiteHeader() {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;
  const role = session?.profile?.role;

  // Clients who arrived through a provider's link never see browse links.
  const linkLocked = Boolean(lockedSlug) && role !== "provider" && role !== "admin";

  const nav: NavItem[] = linkLocked
    ? [{ href: `/p/${lockedSlug}`, label: "Your provider" }]
    : [
        { href: "/providers", label: "Find a provider" },
        { href: "/#how-it-works", label: "How it works" },
        { href: "/beta", label: "Pricing" },
        { href: "/faq", label: "FAQ" },
      ];

  const dashboardHref = homeForRole(role);
  const dashboardLabel = role === "admin" ? "Admin" : role === "provider" ? "Dashboard" : "My request";

  return (
    <header className="sticky top-0 z-40 border-b border-charcoal-2 bg-charcoal text-white">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo inverse />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[6px] px-3 py-2 text-[15px] font-medium text-plaster hover:bg-charcoal-2 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {session ? (
            <>
              <LinkButton href={dashboardHref} variant="primary" size="sm">
                {dashboardLabel}
              </LinkButton>
              <form action={signOut}>
                <button type="submit" className="rounded-[6px] px-3 py-2 text-sm font-medium text-plaster hover:bg-charcoal-2">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-[6px] px-3 py-2 text-[15px] font-medium text-plaster hover:bg-charcoal-2">
                Log in
              </Link>
              <LinkButton href="/signup" variant="primary" size="sm">
                Join FairGround
              </LinkButton>
            </>
          )}
        </div>

        {/* Mobile menu: no JavaScript needed */}
        <details className="group relative md:hidden">
          <summary
            className="flex size-10 cursor-pointer list-none items-center justify-center rounded-[6px] hover:bg-charcoal-2 [&::-webkit-details-marker]:hidden"
            aria-label="Open menu"
          >
            <Menu aria-hidden className="size-6" />
          </summary>
          <div className="absolute right-0 top-12 w-64 rounded-[10px] border border-charcoal-2 bg-charcoal p-2 shadow-lg">
            <nav aria-label="Mobile" className="flex flex-col">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-[6px] px-3 py-2.5 text-plaster hover:bg-charcoal-2">
                  {item.label}
                </Link>
              ))}
              <div className="my-2 border-t border-charcoal-2" />
              {session ? (
                <>
                  <Link href={dashboardHref} className="rounded-[6px] px-3 py-2.5 font-semibold text-safety hover:bg-charcoal-2">
                    {dashboardLabel}
                  </Link>
                  <form action={signOut}>
                    <button type="submit" className="w-full rounded-[6px] px-3 py-2.5 text-left text-plaster hover:bg-charcoal-2">
                      Log out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="rounded-[6px] px-3 py-2.5 text-plaster hover:bg-charcoal-2">
                    Log in
                  </Link>
                  <Link href="/signup" className="rounded-[6px] px-3 py-2.5 font-semibold text-safety hover:bg-charcoal-2">
                    Join FairGround
                  </Link>
                </>
              )}
            </nav>
          </div>
        </details>
      </Container>
    </header>
  );
}
