import type { Metadata } from "next";
import { CapBar } from "@/components/provider/cap-bar";
import { PausedBanner } from "@/components/provider/paused-banner";
import { OverageForm, PauseForm } from "@/components/provider/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { formatDateOnly, money } from "@/lib/format";
import { requireProvider } from "@/lib/provider-session";
import { getSettings, overageCentsForPlan } from "@/lib/settings";
import { getProviderUsage } from "@/lib/usage";

export const metadata: Metadata = { title: "Settings" };

export default async function ProviderSettingsPage() {
  const { provider } = await requireProvider("/dashboard/settings");
  const [settings, usage] = await Promise.all([getSettings(), getProviderUsage(provider.id)]);
  const overagePrice = money(overageCentsForPlan(settings, provider.plan));
  const monthly = money(provider.plan === "beta" ? settings.beta_monthly_cents : settings.std_monthly_cents);
  const lockDate = formatDateOnly(provider.plan_price_locked_until);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="You decide how many requests you get. FairGround never charges for a request without your consent." />
      {provider.requests_paused ? <PausedBanner reason={provider.paused_reason} /> : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[22px]">Receiving requests</h2>
          {provider.requests_paused ? <Badge tone="neutral">Paused</Badge> : <Badge tone="success">Accepting requests</Badge>}
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-[15px] text-muted">
            Pause or resume any time with one click, with no penalty. While paused you stay listed, and clients see
            &quot;Not accepting requests right now&quot;.
          </p>
          <PauseForm paused={provider.requests_paused} reason={provider.paused_reason} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[22px]">Monthly limit</h2>
        </CardHeader>
        <CardBody className="space-y-6">
          <CapBar used={usage.used} cap={provider.monthly_cap} overage={usage.overage} />
          <div className="rounded-[10px] border border-line bg-plaster p-5">
            <h3 className="text-lg">When you reach {provider.monthly_cap} requests</h3>
            {provider.overage_opt_in ? (
              <p className="mt-2 text-[15px]">
                <Badge tone="info">Extra requests on</Badge> You keep receiving requests. Each one after your included
                requests costs <strong className="tabular">{overagePrice}</strong>.
              </p>
            ) : (
              <p className="mt-2 text-[15px]">
                <Badge tone="neutral">Pause at limit</Badge> We pause new requests automatically until the 1st of next
                month. You are never charged for extra requests.
              </p>
            )}
            <div className="mt-4">
              <OverageForm optIn={provider.overage_opt_in} priceLabel={`${overagePrice} per extra request`} />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[22px]">Your plan</h2>
        </CardHeader>
        <CardBody className="grid gap-4 text-[15px] sm:grid-cols-3">
          <div>
            <p className="font-semibold">Plan</p>
            <p className="text-muted">{provider.plan === "beta" ? "Founding member" : "Standard"}</p>
          </div>
          <div>
            <p className="font-semibold">Monthly price</p>
            <p className="tabular text-muted">
              {monthly} for {provider.monthly_cap} requests
            </p>
          </div>
          <div>
            <p className="font-semibold">Price locked until</p>
            <p className="text-muted">{lockDate ?? "Not applicable"}</p>
          </div>
          <p className="text-sm text-muted sm:col-span-3">Billing is being set up. You will not be charged until it is live and you have agreed to it.</p>
        </CardBody>
      </Card>
    </div>
  );
}
