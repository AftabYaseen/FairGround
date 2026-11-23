import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getOwnProvider } from "@/lib/providers";

/** Signed-in provider who has finished onboarding. Providers do not verify their phone. */
export async function requireProvider(path: string) {
  const session = await requireRole("provider", path);
  const provider = await getOwnProvider(session.userId);
  if (!provider?.onboarded_at) redirect("/dashboard/onboarding");
  return { session, provider };
}
