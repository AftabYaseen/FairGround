import "server-only";

import { headers } from "next/headers";

/** Best-effort caller IP and user agent for audit and rate limiting. */
export async function getRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = (forwarded?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  const userAgent = h.get("user-agent")?.slice(0, 500) ?? null;
  return { ip: ip ? ip.slice(0, 64) : null, userAgent };
}
