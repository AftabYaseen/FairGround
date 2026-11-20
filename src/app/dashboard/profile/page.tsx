import type { Metadata } from "next";
import Link from "next/link";
import { ProviderProfileForm } from "@/components/provider/profile-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getCategories, getProviderCategoryIds } from "@/lib/providers";
import { requireProvider } from "@/lib/provider-session";

export const metadata: Metadata = { title: "Edit profile" };

export default async function ProfilePage() {
  const { provider } = await requireProvider("/dashboard/profile");
  const [categories, categoryIds] = await Promise.all([getCategories(), getProviderCategoryIds(provider.id)]);

  return (
    <>
      <PageHeader
        title="Public profile"
        description={
          <>
            This is what clients see on{" "}
            <Link href={`/p/${provider.slug}?from=browse`} className="link">
              your public page
            </Link>
            .
          </>
        }
      />
      <Card>
        <CardBody>
          <ProviderProfileForm
            mode="edit"
            categories={categories}
            initial={{
              business_name: provider.business_name,
              tagline: provider.tagline ?? "",
              description: provider.description ?? "",
              typical_jobs: provider.typical_jobs ?? "",
              phone_public: provider.phone_public ?? "",
              website: provider.website ?? "",
              city: provider.city ?? "",
              state: provider.state ?? "",
              service_zips: provider.service_zips.join(", "),
              years_in_business: provider.years_in_business?.toString() ?? "",
              categories: categoryIds,
              logo_url: provider.logo_url,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
