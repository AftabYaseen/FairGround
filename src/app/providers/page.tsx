import { MapPin, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvailabilityBadge } from "@/components/provider/availability-badge";
import { ProviderLogo } from "@/components/provider/provider-logo";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Container, EmptyState } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { DIRECTORY_PAGE_SIZE, getCategories, listDirectory } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Find a provider",
  description: "Browse FairGround service providers by category and ZIP code. Send one request to one provider.",
};

export default async function DirectoryPage(props: PageProps<"/providers">) {
  const [sp, cookieStore, session] = await Promise.all([props.searchParams, cookies(), getSession()]);
  const role = session?.profile?.role;

  // Contractor link lock: clients who arrived through a provider's link cannot browse.
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;
  if (lockedSlug && role !== "provider" && role !== "admin") redirect(`/p/${lockedSlug}`);

  const categories = await getCategories();
  const categorySlug = typeof sp.category === "string" ? sp.category : "";
  const category = categories.find((c) => c.slug === categorySlug);
  const zipRaw = typeof sp.zip === "string" ? sp.zip.trim() : "";
  const zip = /^\d{5}$/.test(zipRaw) ? zipRaw : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const { providers, total, error } = await listDirectory({ categoryId: category?.id, zip: zip || undefined, page });
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (category) q.set("category", category.slug);
    if (zip) q.set("zip", zip);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/providers?${s}` : "/providers";
  };

  return (
    <>
      <section className="border-b border-line bg-white">
        <Container className="py-10 sm:py-12">
          <h1 className="text-4xl sm:text-5xl">Find a provider</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">Browse by service and ZIP code, then send your request to one provider.</p>
          <div className="mt-6 flex items-start gap-3 rounded-[6px] border-l-4 border-safety bg-plaster px-4 py-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-charcoal" />
            <p className="font-medium">
              You may submit one active request to one provider at a time. Please review profiles carefully.
            </p>
          </div>
          <form method="get" action="/providers" className="mt-6 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="category">Service</Label>
              <Select id="category" name="category" defaultValue={category?.slug ?? ""}>
                <option value="">All services</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zip">ZIP code</Label>
              <Input id="zip" name="zip" inputMode="numeric" maxLength={5} defaultValue={zip} placeholder="33602" className="tabular" />
            </div>
            <button type="submit" className={buttonClass("primary")}>
              Search
            </button>
          </form>
          {zipRaw && !zip ? <p className="mt-2 text-sm font-medium text-danger">Enter a 5-digit ZIP code.</p> : null}
        </Container>
      </section>

      <Container className="py-10">
        {error ? (
          <Alert tone="danger">We could not load the directory right now. Please try again in a moment.</Alert>
        ) : providers.length === 0 ? (
          <EmptyState title="No providers match yet">
            Try another service or ZIP code. FairGround is growing, and new providers join every week.
          </EmptyState>
        ) : (
          <>
            <p className="tabular mb-4 text-sm text-muted">
              {total} provider{total === 1 ? "" : "s"}
              {category ? ` for ${category.name}` : ""}
              {zip ? ` in ${zip}` : ""}
            </p>
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {providers.map(({ provider, categoryIds }) => (
                <li key={provider.id}>
                  <Link
                    href={`/p/${provider.slug}?from=browse`}
                    className="flex h-full flex-col rounded-[10px] border border-line bg-white p-5 transition-shadow hover:shadow-[0_2px_10px_rgba(30,33,36,0.08)]"
                  >
                    <div className="flex items-start gap-4">
                      <ProviderLogo name={provider.business_name} url={provider.logo_url} size={56} />
                      <div className="min-w-0">
                        <h2 className="truncate text-xl">{provider.business_name}</h2>
                        {provider.city ? (
                          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                            <MapPin aria-hidden className="size-3.5" />
                            {provider.city}
                            {provider.state ? `, ${provider.state}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {provider.tagline ? <p className="mt-4 line-clamp-2 text-[15px]">{provider.tagline}</p> : null}
                    <p className="mt-3 line-clamp-1 text-sm text-muted">
                      {categoryIds.map((id) => catName.get(id)).filter(Boolean).join(", ")}
                    </p>
                    <div className="mt-auto pt-4">
                      <AvailabilityBadge paused={provider.requests_paused} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 ? (
              <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className={buttonClass("secondary", "sm")}>
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="tabular text-sm text-muted">
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link href={pageHref(page + 1)} className={buttonClass("secondary", "sm")}>
                    Next
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}
      </Container>
    </>
  );
}
