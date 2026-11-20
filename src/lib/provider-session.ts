import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getOwnProvider } from "@/lib/providers";

/** Signed-in, phone-verified provider who has finished onboarding. */
export async function requireProvider(path: string) {
  const session = await requireRole("provider", path);
  if (!session.profile.phone_verified_at) redirect(`/verify-phone?next=${encodeURIComponent(path)}`);
  const provider = await getOwnProvider(session.userId);
  if (!provider?.onboarded_at) redirect("/dashboard/onboarding");
  return { session, provider };
}
