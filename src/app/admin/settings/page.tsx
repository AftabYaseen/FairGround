import type { Metadata } from "next";
import { AdminSettingsForm } from "@/components/admin/settings-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Admin: settings" };

export default async function AdminSettingsPage() {
  await requireRole("admin", "/admin/settings");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="Prices, dates and limits shown across FairGround. Changes apply immediately." />
      <Card>
        <CardBody>
          <AdminSettingsForm s={settings} />
        </CardBody>
      </Card>
    </>
  );
}
