import { Download, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/misc";
import { siteUrl } from "@/lib/env";
import { requireProvider } from "@/lib/provider-session";

export const metadata: Metadata = { title: "Your request link" };

export default async function LinkPage(props: PageProps<"/dashboard/link">) {
  const { provider } = await requireProvider("/dashboard/link");
  const { welcome } = await props.searchParams;
  const link = `${siteUrl()}/p/${provider.slug}`;

  let qr: string | null = null;
  try {
    qr = await QRCode.toDataURL(link, { width: 480, margin: 2, color: { dark: "#1E2124", light: "#FFFFFF" } });
  } catch (err) {
    console.error("[link] QR generation failed:", err);
  }

  const shareText = `Need work done? Send your request straight to ${provider.business_name} on FairGround. It goes to us only, never to a bidding list: ${link}`;

  return (
    <>
      {welcome ? (
        <Alert tone="success" title="Your profile is live" className="mb-6">
          Share the link below with your clients. Every request that comes through it goes to you only.
        </Alert>
      ) : null}
      <PageHeader title="Your request link" description="Put it on your website, invoices, truck, business cards and social profiles." />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Link</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="tabular break-all rounded-[6px] border border-line bg-plaster px-4 py-3 font-medium">{link}</p>
              <div className="flex flex-wrap gap-3">
                <CopyButton text={link} label="Copy link" />
                <Link href={`/p/${provider.slug}?from=browse`} className={buttonClass("secondary")} target="_blank">
                  <ExternalLink aria-hidden className="size-4" /> Preview page
                </Link>
              </div>
              <p className="text-sm text-muted">
                Clients who arrive through this link only see you. They cannot browse other providers while their request is
                open.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Share text</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="rounded-[6px] border border-line bg-plaster px-4 py-3">{shareText}</p>
              <CopyButton text={shareText} label="Copy text" variant="secondary" />
            </CardBody>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <h2 className="text-[22px]">QR code</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
                <img src={qr} alt={`QR code linking to ${link}`} className="mx-auto w-full max-w-64 rounded-[6px] border border-line" />
                <a href={qr} download={`fairground-${provider.slug}-qr.png`} className={buttonClass("steel", "md", "w-full")}>
                  <Download aria-hidden className="size-4" /> Download PNG
                </a>
              </>
            ) : (
              <p className="text-muted">The QR code could not be generated right now. Please refresh the page.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
