import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProviderProfileForm } from "@/components/provider/profile-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { getCategories, getOwnProvider } from "@/lib/providers";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const session = await requireRole("provider", "/dashboard/onboarding");
  const existing = await getOwnProvider(session.userId);
  if (existing?.onboarded_at) redirect("/dashboard");
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Provider setup"
        title="Set up your FairGround profile"
        description="Four short steps. Clients see this on your public page, and you get your own request link at the end."
      />
      <Card>
        <CardBody>
          <ProviderProfileForm
            mode="wizard"
            categories={categories}
            initial={{
              business_name: "",
              tagline: "",
              description: "",
              typical_jobs: "",
              phone_public: formatPhone(session.profile.phone),
              website: "",
              city: "",
              state: "",
              service_zips: "",
              years_in_business: "",
              categories: [],
              logo_url: null,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
