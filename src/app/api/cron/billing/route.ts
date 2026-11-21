import { NextResponse, type NextRequest } from "next/server";
import { isAuthnetConfigured } from "@/lib/authnet";
import { pauseLapsedCancellations, reconcileSubscriptions, runMonthEndOverage, runPriceLock } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily billing job (Vercel Cron, see vercel.json). Protected by CRON_SECRET.
 *  1. Reconcile ARB subscriptions and payments with Authorize.net (catches missed webhooks).
 *  2. Days 1 to 7 of the month: bill last month's extra requests (idempotent, one invoice per month).
 *  3. Founding price lock: 60-day notices and scheduled price changes.
 *  4. Pause canceled providers once their paid period ends.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAuthnetConfigured()) {
    console.warn("[cron/billing] skipped: Authorize.net keys are not set");
    return NextResponse.json({ skipped: "authnet not configured" });
  }

  const summary: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      summary[name] = await fn();
    } catch (err) {
      console.error(`[cron/billing] ${name} failed:`, err);
      summary[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  };

  await step("reconcile", () => reconcileSubscriptions());
  if (new Date().getUTCDate() <= 7) await step("overage", () => runMonthEndOverage());
  await step("priceLock", () => runPriceLock());
  await step("lapsed", () => pauseLapsedCancellations());

  return NextResponse.json(summary);
}
